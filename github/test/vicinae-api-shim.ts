import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * A stand-in for `@vicinae/api`, for the backend check only.
 *
 * That package reads the launcher environment while it is being imported and
 * throws outside it, so anything under `src/api/` is unimportable from a plain
 * `tsx` run. `tsconfig.backend.json` maps this file over the package, which
 * hands `src/api/client.ts` the two preferences it reads.
 *
 * The token the launcher is configured with lives in the launcher's database,
 * like any other password preference; `GITHUB_TOKEN` overrides it so a check
 * can ask GitHub how it treats a bad one.
 */

function storedToken(): string {
  const db = join(homedir(), ".local/share/vicinae/vicinae.db");
  const query =
    "select value from storage_data_item where namespace_id='@black/github:preferences' and key='personalAccessToken'";
  return (spawnSync("sqlite3", [db, query], { encoding: "utf8" }).stdout ?? "").trim();
}

export function token(): string {
  return process.env.GITHUB_TOKEN ?? storedToken();
}

export function getPreferenceValues<T>(): T {
  return {
    personalAccessToken: token(),
    numberOfResults: process.env.GITHUB_RESULTS ?? "30",
  } as T;
}
