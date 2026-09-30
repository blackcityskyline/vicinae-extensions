import { execFile } from "node:child_process";
import { LocalStorage } from "@vicinae/api";
import { LOCAL_STORAGE_KEY } from "~/constants/general";
import { captureException, debugLog } from "~/utils/log";

/** Session token and the hash used for master-password re-prompting. */
export const SessionStorage = {
  getSavedSession: () =>
    Promise.all([
      LocalStorage.getItem<string>(LOCAL_STORAGE_KEY.SESSION_TOKEN),
      LocalStorage.getItem<string>(LOCAL_STORAGE_KEY.REPROMPT_HASH),
      LocalStorage.getItem<string>(LOCAL_STORAGE_KEY.LAST_ACTIVITY_TIME),
      LocalStorage.getItem<string>(LOCAL_STORAGE_KEY.VAULT_LAST_STATUS),
    ]),

  clearSession: async () => {
    await Promise.all([
      LocalStorage.removeItem(LOCAL_STORAGE_KEY.SESSION_TOKEN),
      LocalStorage.removeItem(LOCAL_STORAGE_KEY.REPROMPT_HASH),
    ]);
  },

  saveSession: async (token: string, passwordHash: string) => {
    await Promise.all([
      LocalStorage.setItem(LOCAL_STORAGE_KEY.SESSION_TOKEN, token),
      LocalStorage.setItem(LOCAL_STORAGE_KEY.REPROMPT_HASH, passwordHash),
    ]);
  },

  logoutClearSession: async () => {
    await Promise.all([
      LocalStorage.removeItem(LOCAL_STORAGE_KEY.SESSION_TOKEN),
      LocalStorage.removeItem(LOCAL_STORAGE_KEY.REPROMPT_HASH),
      LocalStorage.removeItem(LOCAL_STORAGE_KEY.LAST_ACTIVITY_TIME),
    ]);
  },
};

/**
 * Asks systemd-logind whether the desktop session is currently locked.
 *
 * This is the Linux equivalent of the Raycast extension's macOS screen-lock
 * check. When logind is unavailable (a non-systemd session, for example) the
 * vault is left unlocked, since failing closed would lock the user out on every
 * launch.
 */
export async function isSessionLocked(): Promise<boolean> {
  try {
    const stdout = await new Promise<string>((resolve, reject) => {
      execFile(
        "loginctl",
        ["show-session", process.env.XDG_SESSION_ID ?? "self", "--property=LockedHint", "--value"],
        { timeout: 3000, encoding: "utf8" },
        (error, out) => (error ? reject(error) : resolve(out)),
      );
    });

    return stdout.trim() === "yes";
  } catch (error) {
    debugLog("loginctl unavailable, skipping lock check", error);
    captureException("Failed to read session lock state", error);
    return false;
  }
}
