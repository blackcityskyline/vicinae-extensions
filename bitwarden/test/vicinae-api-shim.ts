import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * A stand-in for `@vicinae/api`, for the backend checks only.
 *
 * That package reads the launcher environment while it is being imported and
 * throws outside it, so anything that touches `src/api/` is unimportable from a
 * plain `tsx` run. `tsconfig.backend.json` maps this file over the package.
 *
 * It hands the code what the launcher would: the preferences the user set, the
 * extension's own data directory, an in-memory `LocalStorage`, and a toast that
 * keeps its fields instead of drawing anything.
 */

const EXTENSION_DATA = process.env.BW_APPDATA_DIR ?? join(homedir(), ".local/share/vicinae/support/bitwarden");

function storedPreference(key: string): string {
  const db = join(homedir(), ".local/share/vicinae/vicinae.db");
  const query = `select value from storage_data_item where namespace_id='@black/bitwarden:preferences' and key='${key}'`;
  return (spawnSync("sqlite3", [db, query], { encoding: "utf8" }).stdout ?? "").trim();
}

export function getPreferenceValues<T>(): T {
  return {
    cliPath: process.env.BW_CLI_PATH ?? "",
    clientId: process.env.BW_CLIENTID ?? storedPreference("clientId"),
    clientSecret: process.env.BW_CLIENTSECRET ?? storedPreference("clientSecret"),
    serverUrl: process.env.BW_SERVER_URL ?? "",
  } as T;
}

/** Raycast-name icons are built from this at import time; any value will do. */
export const Icon = new Proxy(
  {},
  {
    get: (_target, name) => String(name),
  },
);

export const environment = {
  supportPath: EXTENSION_DATA,
  commandName: "",
  isDevelopment: false,
};

const storage = new Map<string, string>();

export const LocalStorage = {
  async getItem<T>(key: string): Promise<T | undefined> {
    const value = storage.get(key);
    return value === undefined ? undefined : (JSON.parse(value) as T);
  },
  async setItem(key: string, value: unknown): Promise<void> {
    storage.set(key, JSON.stringify(value));
  },
  async removeItem(key: string): Promise<void> {
    storage.delete(key);
  },
  async clear(): Promise<void> {
    storage.clear();
  },
};

export const Toast = {
  Style: { Animated: "animated", Success: "success", Failure: "failure" } as const,
};

type ToastOptions = { style?: string; title?: string; message?: string };

export function showToast(options: ToastOptions) {
  const toast = {
    ...options,
    show: async () => {},
    hide: async () => {},
  };
  return toast;
}

/** The real CLI the extension would run, or "" when there is none. */
export function installed(): string {
  const result = spawnSync("sh", ["-c", "command -v bw"], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "";
}
