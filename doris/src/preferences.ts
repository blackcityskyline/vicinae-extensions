import { getPreferenceValues } from "@vicinae/api";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function expandHome(path: string): string {
  return path === "~" || path.startsWith("~/")
    ? join(homedir(), path.slice(1))
    : path;
}

/**
 * The CLI to run: the configured path, else `doris` on PATH, else the place
 * `make install` in the doris repository puts it. Vicinae's server does not
 * inherit a login shell's PATH, so `~/.local/bin` is often missing from it.
 */
export function dorisBinary(): string {
  const { dorisPath } = getPreferenceValues<Preferences>();
  const configured = expandHome(dorisPath?.trim() ?? "");
  if (configured) return configured;

  for (const dir of (process.env.PATH ?? "").split(":")) {
    if (dir && existsSync(join(dir, "doris"))) return join(dir, "doris");
  }

  const installed = join(homedir(), ".local", "bin", "doris");
  return existsSync(installed) ? installed : "doris";
}
