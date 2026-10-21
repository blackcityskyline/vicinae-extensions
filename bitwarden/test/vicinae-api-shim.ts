import { spawnSync } from "node:child_process";

/**
 * A stand-in for `@vicinae/api`, for the backend check only.
 *
 * That package reads the launcher environment while it is being imported and
 * throws outside it, so `src/api/cli.ts` — which reads one preference — is
 * unimportable from a plain `tsx` run. `tsconfig.backend.json` maps this file
 * over the package; the only preference the CLI code asks for is `cliPath`,
 * and empty means "find `bw` on PATH", which is what the checks exercise.
 */
export function getPreferenceValues<T>(): T {
  return { cliPath: process.env.BW_CLI_PATH ?? "" } as T;
}

/** The real CLI the extension would run, or "" when there is none. */
export function installed(): string {
  const result = spawnSync("sh", ["-c", "command -v bw"], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "";
}
