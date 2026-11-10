import { chmod, mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { environment } from "@vicinae/api";
import { LAUNCHER_SCRIPT } from "~/utils/launcher-script";

const launcherPath = (): string =>
  join(environment.supportPath || join(homedir(), ".local", "share", "vicinae", "extensions", "webapp-maker"), "webapp-launch");

/**
 * Installs the launcher script the desktop entries call, and returns its path.
 * It is rewritten every time so an updated extension never leaves an old script
 * behind.
 */
export async function ensureLauncher(): Promise<string> {
  const path = launcherPath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, LAUNCHER_SCRIPT, { mode: 0o755 });
  await chmod(path, 0o755);
  return path;
}
