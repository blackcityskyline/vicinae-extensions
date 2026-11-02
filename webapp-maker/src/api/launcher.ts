import { mkdir, writeFile, chmod } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { environment } from "@vicinae/api";
import { LAUNCHER_SCRIPT } from "~/utils/launcher-script";

let ensured = false;

export function getLauncherPath(): string {
  // Prefer extension support path if available, else fall back to a fixed location
  const base = environment.supportPath || join(homedir(), ".local", "share", "vicinae", "extensions", "webapp-maker");
  return join(base, "webapp-launch");
}

export async function ensureLauncher(): Promise<string> {
  const launcherPath = getLauncherPath();
  const dir = launcherPath.substring(0, launcherPath.lastIndexOf("/"));
  await mkdir(dir, { recursive: true });
  await writeFile(launcherPath, LAUNCHER_SCRIPT, { mode: 0o755 });
  await chmod(launcherPath, 0o755);
  ensured = true;
  return launcherPath;
}

export function isLauncherEnsured(): boolean {
  return ensured;
}
