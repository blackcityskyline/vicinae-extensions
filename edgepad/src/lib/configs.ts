import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

export type ConfigInfo = { path: string; name: string; active: boolean };

export function expandHome(path: string): string {
  const trimmed = path.trim();
  if (trimmed === "~") return homedir();
  if (trimmed.startsWith("~/")) return join(homedir(), trimmed.slice(2));
  return trimmed;
}

/** The directory edgepad reads when no --config is passed. */
export function resolveConfigDir(configured?: string): string {
  if (configured?.trim()) return expandHome(configured);
  const xdg = process.env.XDG_CONFIG_HOME?.trim();
  return xdg ? join(xdg, "edgepad") : join(homedir(), ".config", "edgepad");
}

/** `hyprland` is the desktop name; the wrapper names its file after `hypr`. */
function configStem(desktop: string | undefined): string | undefined {
  const first = desktop?.split(":")[0]?.trim().toLowerCase();
  if (!first) return undefined;
  return first === "hyprland" ? "hypr" : first;
}

function listConfigFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".toml") && !name.startsWith("."))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => join(dir, name))
    .filter((path) => {
      try {
        return statSync(path).isFile();
      } catch {
        return false;
      }
    });
}

/**
 * The same pick the session wrapper makes: `<desktop>-*.toml` for the current
 * desktop, or `edgepad.toml` when the desktop is unknown. Nothing is guessed:
 * with no match there is simply no active config to mark.
 */
export function pickActiveConfig(files: string[], desktop: string | undefined): string | undefined {
  const stem = configStem(desktop);
  if (stem) {
    const named = files.find((path) => basename(path).startsWith(`${stem}-`));
    if (named) return named;
  }
  return files.find((path) => basename(path) === "edgepad.toml");
}

export function discoverConfigs(dir: string, desktop: string | undefined): ConfigInfo[] {
  const files = listConfigFiles(dir);
  const active = pickActiveConfig(files, desktop);
  return files.map((path) => ({ path, name: basename(path), active: path === active }));
}
