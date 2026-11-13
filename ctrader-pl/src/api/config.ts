import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * What the account needs to be read again next time: the application credentials the
 * owner created at openapi.ctrader.com, the tokens they earned, and which account.
 *
 * It lives in the extension's support folder, not in the Omarchy plugin's
 * `~/.config/omarchy/ctrader/config.json`, so the two never overwrite each other.
 */
export type Environment = "demo" | "live";

export type Config = {
  environment: Environment;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  accessToken: string;
  refreshToken: string;
  accountId: number;
  traderLogin: string;
};

/** Owner-only, from the first byte: these are the credentials to the account. */
const MODE = 0o600;

export function loadConfig(path: string): Config | null {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf8")) as Config;
  } catch {
    // A hand-edited or half-written file reads as "not connected" rather than as a crash.
    return null;
  }
}

export function saveConfig(path: string, config: Config): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(config, null, 2)}\n`, { mode: MODE });
  chmodSync(tmp, MODE);
  renameSync(tmp, path);
}
