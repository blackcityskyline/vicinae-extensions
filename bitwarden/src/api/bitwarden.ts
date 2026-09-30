import { environment, getPreferenceValues, LocalStorage, showToast, Toast } from "@vicinae/api";
import { BwCliError, BwCliNotFoundError, runCli } from "~/api/cli";
import { DEFAULT_SERVER_URL, LOCAL_STORAGE_KEY } from "~/constants/general";
import { VaultState, VaultStatus } from "~/types/general";
import { PasswordGeneratorOptions } from "~/types/passwords";
import { Folder, Item, ItemType, Login } from "~/types/vault";
import { getPasswordGeneratingArgs } from "~/utils/passwords";
import { getServerUrlPreference } from "~/utils/preferences";
import {
  InvalidSessionTokenError,
  NotLoggedInError,
  PremiumFeatureError,
  VaultIsLockedError,
} from "~/utils/errors";
import { captureException } from "~/utils/log";

type ActionListeners = {
  login?: () => MaybePromise<void>;
  logout?: (reason?: string) => MaybePromise<void>;
  lock?: (reason?: string) => MaybePromise<void>;
  unlock?: (password: string, sessionToken: string) => MaybePromise<void>;
};

type ActionListenersMap<T extends keyof ActionListeners = keyof ActionListeners> = Map<T, Set<ActionListeners[T]>>;

/**
 * Every command returns a result rather than throwing, so callers can branch on
 * a known failure instead of wrapping each call in try/catch.
 */
type MaybeError<T = void> = { result: T; error?: undefined } | { result?: undefined; error: Error };

type ExecProps = {
  /** Whether this call should count as vault activity for the inactivity timer. */
  resetVaultTimeout: boolean;
  abortController?: AbortController;
  input?: string;
  env?: Record<string, string>;
  allowFailure?: boolean;
};

type LockOptions = {
  reason?: string;
  checkVaultStatus?: boolean;
  /** Fires the listeners before the command finishes, so the UI updates first. */
  immediate?: boolean;
};

type LogoutOptions = {
  reason?: string;
  immediate?: boolean;
};

type CreateLoginItemOptions = {
  name: string;
  username?: string;
  password: string;
  folderId: string | null;
  uri?: string;
};

const { supportPath } = environment;

export class Bitwarden {
  private sessionToken?: string;
  private tempSessionToken?: string;
  private actionListeners: ActionListenersMap = new Map();
  private preferences = getPreferenceValues<Preferences>();
  private initPromise: Promise<void>;

  constructor(private toastInstance?: Toast) {
    this.initPromise = this.checkServerUrl(getServerUrlPreference());
  }

  /** Resolves once the CLI is known to be usable and configured. */
  async initialize(): Promise<this> {
    await this.initPromise;
    return this;
  }

  private get baseEnv(): Record<string, string> {
    const { clientId, clientSecret } = this.preferences;
    return {
      BITWARDENCLI_APPDATA_DIR: supportPath,
      BW_CLIENTID: (clientId ?? "").trim(),
      BW_CLIENTSECRET: (clientSecret ?? "").trim(),
      ...(this.sessionToken ? { BW_SESSION: this.sessionToken } : {}),
    };
  }

  private async exec(args: string[], options: ExecProps): Promise<string> {
    const { abortController, input, resetVaultTimeout, env: envOverrides, allowFailure } = options;

    let env = this.baseEnv;
    if (this.tempSessionToken) {
      env = { ...env, BW_SESSION: this.tempSessionToken };
      this.tempSessionToken = undefined;
    }
    if (envOverrides) env = { ...env, ...envOverrides };

    let stdout: string;
    try {
      stdout = await runCli(args, { input, env, signal: abortController?.signal, allowFailure });
    } catch (error) {
      if (error instanceof BwCliNotFoundError) throw error;
      throw this.translateCliError(error);
    }

    if (resetVaultTimeout) {
      await LocalStorage.setItem(LOCAL_STORAGE_KEY.LAST_ACTIVITY_TIME, new Date().toISOString());
    }

    return stdout;
  }

  /**
   * Maps well-known CLI failures onto typed errors.
   *
   * An expired session token logs the CLI out, since no further command would
   * succeed until the user unlocks again.
   */
  private async translateCliError(error: unknown): Promise<Error> {
    const text = error instanceof BwCliError ? `${error.stderr} ${error.message}` : String(error);

    if (/not logged in/i.test(text)) {
      await this.handlePostLogout("Not logged in");
      return new NotLoggedInError();
    }
    if (/Premium status/i.test(text)) {
      return new PremiumFeatureError();
    }
    if (/Master password/i.test(text)) {
      // The CLI is asking for the master password, which only happens when the
      // vault is locked.
      await this.lock();
      return new VaultIsLockedError();
    }
    if (/Invalid session token/i.test(text)) {
      await this.logout({ reason: "Invalid session token", immediate: true });
      return new InvalidSessionTokenError();
    }
    return error instanceof Error ? error : new Error(text);
  }

  /** Wraps a command so a known failure is returned instead of thrown. */
  private async attempt<T>(name: string, run: () => Promise<T>): Promise<MaybeError<T>> {
    try {
      return { result: await run() };
    } catch (error) {
      captureException(name, error);
      if (error instanceof NotLoggedInError) await this.handlePostLogout("Not logged in");
      return { error: error as Error };
    }
  }

  setSessionToken(token: string): void {
    this.sessionToken = token;
  }

  clearSessionToken(): void {
    this.sessionToken = undefined;
  }

  /** Applies a token to exactly the next command, then reverts to the session token. */
  withSession(token: string): this {
    this.tempSessionToken = token;
    return this;
  }

  /**
   * Points the CLI at the configured server.
   *
   * The CLI persists this in its own config, so a mismatch means the stored URL
   * has to be re-applied, which invalidates any existing session.
   */
  private async checkServerUrl(serverUrl: string | undefined): Promise<void> {
    const storedServer = await LocalStorage.getItem<string>(LOCAL_STORAGE_KEY.SERVER_URL);
    if (storedServer === serverUrl) return;
    if (!serverUrl && !storedServer) return;

    const toast = await this.showToast({ style: Toast.Style.Animated, title: "Switching server..." });
    try {
      try {
        await this.logout();
      } catch {
        // Not being logged in is fine here.
      }
      await this.exec(["config", "server", serverUrl || DEFAULT_SERVER_URL], { resetVaultTimeout: false });
      if (serverUrl) {
        await LocalStorage.setItem(LOCAL_STORAGE_KEY.SERVER_URL, serverUrl);
      } else {
        await LocalStorage.removeItem(LOCAL_STORAGE_KEY.SERVER_URL);
      }
      toast.style = Toast.Style.Success;
      toast.title = "Server updated";
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Failed to switch server";
      toast.message = error instanceof Error ? error.message : undefined;
    } finally {
      await toast.hide();
    }
  }

  async getVersion(): Promise<MaybeError<string>> {
    return this.attempt("Failed to get CLI version", async () =>
      (await this.exec(["--version"], { resetVaultTimeout: false })).trim(),
    );
  }

  async login(): Promise<MaybeError> {
    return this.attempt("Failed to log in", async () => {
      await this.exec(["login", "--apikey"], { resetVaultTimeout: true });
      await this.saveLastVaultStatus("locked");
      await this.callActionListeners("login");
    });
  }

  async logout(options?: LogoutOptions): Promise<MaybeError> {
    const { reason, immediate = false } = options ?? {};
    return this.attempt("Failed to log out", async () => {
      if (immediate) await this.handlePostLogout(reason);
      await this.exec(["logout"], { resetVaultTimeout: false });
      await this.saveLastVaultStatus("unauthenticated");
      if (!immediate) await this.handlePostLogout(reason);
    });
  }

  async lock(options?: LockOptions): Promise<MaybeError> {
    const { reason, checkVaultStatus = false, immediate = false } = options ?? {};
    return this.attempt("Failed to lock vault", async () => {
      if (immediate) await this.callActionListeners("lock", reason);

      if (checkVaultStatus) {
        const { error, result } = await this.status();
        if (error) throw error;
        if (result.status === "unauthenticated") throw new NotLoggedInError();
      }

      await this.exec(["lock"], { resetVaultTimeout: false });
      this.clearSessionToken();
      await this.saveLastVaultStatus("locked");
      if (!immediate) await this.callActionListeners("lock", reason);
    });
  }

  async unlock(password: string): Promise<MaybeError<string>> {
    return this.attempt("Failed to unlock vault", async () => {
      this.clearSessionToken();

      // The password goes through the environment, never argv, so it is not
      // visible in the process list.
      const sessionToken = (
        await this.exec(["unlock", "--passwordenv", "BW_PASSWORD", "--raw"], {
          resetVaultTimeout: true,
          env: { BW_PASSWORD: password },
        })
      ).trim();

      if (!sessionToken) throw new InvalidSessionTokenError();

      this.setSessionToken(sessionToken);
      await this.saveLastVaultStatus("unlocked");
      await this.callActionListeners("unlock", password, sessionToken);
      return sessionToken;
    });
  }

  async sync(): Promise<MaybeError> {
    return this.attempt("Failed to sync vault", async () => {
      await this.exec(["sync"], { resetVaultTimeout: true });
    });
  }

  async getItem(id: string): Promise<MaybeError<Item>> {
    return this.attempt("Failed to get item", async () =>
      JSON.parse<Item>(await this.exec(["get", "item", id], { resetVaultTimeout: true })),
    );
  }

  async listItems(): Promise<MaybeError<Item[]>> {
    return this.attempt("Failed to list items", async () => {
      const items = JSON.parse<Item[]>(await this.exec(["list", "items"], { resetVaultTimeout: true }));
      // Unnamed items are not shown in the Bitwarden app either.
      return items.filter((item) => !!item.name);
    });
  }

  async listFolders(): Promise<MaybeError<Folder[]>> {
    return this.attempt("Failed to list folders", async () =>
      JSON.parse<Folder[]>(await this.exec(["list", "folders"], { resetVaultTimeout: true })),
    );
  }

  async createLoginItem(options: CreateLoginItemOptions): Promise<MaybeError<Item>> {
    return this.attempt("Failed to create login item", async () => {
      const itemTemplate = await this.template<Item>("item");
      const loginTemplate = await this.template<Login>("item.login");

      const item: Item = {
        ...itemTemplate,
        name: options.name,
        type: ItemType.LOGIN,
        folderId: options.folderId || null,
        notes: null,
        login: {
          ...loginTemplate,
          username: options.username || null,
          password: options.password,
          totp: null,
          fido2Credentials: undefined,
          uris: options.uri ? [{ match: null, uri: options.uri }] : loginTemplate.uris,
        },
      };

      return JSON.parse<Item>(await this.exec(["create", "item", await this.encode(item)], { resetVaultTimeout: true }));
    });
  }

  async createFolder(name: string): Promise<MaybeError> {
    return this.attempt("Failed to create folder", async () => {
      const folder = await this.template<{ name: string }>("folder");
      folder.name = name;
      await this.exec(["create", "folder", await this.encode(folder)], { resetVaultTimeout: true });
    });
  }

  async getTotp(id: string): Promise<MaybeError<string>> {
    return this.attempt("Failed to get TOTP", async () =>
      (await this.exec(["get", "totp", id], { resetVaultTimeout: true })).trim(),
    );
  }

  async status(): Promise<MaybeError<VaultState>> {
    return this.attempt("Failed to get status", async () =>
      JSON.parse<VaultState>(await this.exec(["status"], { resetVaultTimeout: false })),
    );
  }

  /**
   * Asks the CLI whether the vault is unlocked, without unlocking it.
   *
   * `bw unlock --check` exits non-zero and prints "Vault is locked." when locked;
   * an unauthenticated vault fails the same way, so `status` disambiguates.
   */
  async checkLockStatus(): Promise<VaultStatus> {
    try {
      await this.exec(["unlock", "--check"], { resetVaultTimeout: false });
      await this.saveLastVaultStatus("unlocked");
      return "unlocked";
    } catch (error) {
      captureException("Failed to check lock status", error);
      const stderr = error instanceof BwCliError ? error.stderr : "";
      const status: VaultStatus = /not logged in|unauthenticated/i.test(stderr) ? "unauthenticated" : "locked";
      await this.saveLastVaultStatus(status);
      return status;
    }
  }

  async getTemplate<T = any>(type: string): Promise<MaybeError<T>> {
    return this.attempt("Failed to get template", async () => this.template<T>(type));
  }

  /** Fetches a CLI object template, throwing on failure. */
  private async template<T>(type: string): Promise<T> {
    return JSON.parse<T>(await this.exec(["get", "template", type], { resetVaultTimeout: true }));
  }

  async encode(value: unknown): Promise<string> {
    return this.exec(["encode"], { input: JSON.stringify(value), resetVaultTimeout: false });
  }

  async generatePassword(options?: PasswordGeneratorOptions, abortController?: AbortController): Promise<string> {
    const args = options ? getPasswordGeneratingArgs(options) : [];
    return this.exec(["generate", ...args], { abortController, resetVaultTimeout: false });
  }

  // -- vault status helpers --

  async saveLastVaultStatus(status: VaultStatus): Promise<void> {
    await LocalStorage.setItem(LOCAL_STORAGE_KEY.VAULT_LAST_STATUS, status);
  }

  async getLastSavedVaultStatus(): Promise<VaultStatus | undefined> {
    const stored = await LocalStorage.getItem<VaultStatus>(LOCAL_STORAGE_KEY.VAULT_LAST_STATUS);
    if (stored) return stored;
    const { result } = await this.status();
    return result?.status;
  }

  private async handlePostLogout(reason?: string): Promise<void> {
    this.clearSessionToken();
    await this.callActionListeners("logout", reason);
  }

  /* -- action listeners -- */

  setActionListener<A extends keyof ActionListeners>(action: A, listener: ActionListeners[A]): this {
    const listeners = this.actionListeners.get(action);
    if (listeners) listeners.add(listener);
    else this.actionListeners.set(action, new Set([listener]));
    return this;
  }

  removeActionListener<A extends keyof ActionListeners>(action: A, listener: ActionListeners[A]): this {
    this.actionListeners.get(action)?.delete(listener);
    return this;
  }

  private async callActionListeners<A extends keyof ActionListeners>(
    action: A,
    ...args: Parameters<NonNullable<ActionListeners[A]>>
  ) {
    for (const listener of this.actionListeners.get(action) ?? []) {
      try {
        await (listener as (...a: typeof args) => MaybePromise<void>)(...args);
      } catch (error) {
        captureException(`Error in bitwarden ${action} listener`, error);
        // A failed unlock listener means the session is not usable, so the
        // failure has to propagate.
        if (action === "unlock") throw error;
      }
    }
  }

  /**
   * Shows a toast, reusing the caller's instance when there is one so the
   * message updates in place instead of stacking.
   */
  private showToast = async (options: Toast.Options): Promise<Toast> => {
    if (this.toastInstance) {
      const toast = this.toastInstance;
      if (options.style) toast.style = options.style;
      toast.title = options.title;
      toast.message = options.message;
      await toast.show();
      return toast;
    }
    return showToast(options);
  };
}
