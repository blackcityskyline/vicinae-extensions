import { accessSync, constants, existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

import { pickProfile, type ProfileEntry } from "~/utils/profile.ts";

export interface BrowserDef {
  id: string;
  title: string;
  /** Candidate executable names, most likely first. */
  binaries: string[];
  /** History directory inside the config root. */
  configDir: string;
}

/** The Chromium family usable from `--app`. Kept in the same order as `webapp-maker`. */
export const BROWSERS: BrowserDef[] = [
  { id: "helium", title: "Helium", binaries: ["helium-browser", "helium"], configDir: "net.imput.helium" },
  {
    id: "chromium",
    title: "Chromium",
    binaries: ["chromium", "chromium-browser"],
    configDir: "chromium",
  },
  { id: "thorium", title: "Thorium", binaries: ["thorium", "thorium-browser"], configDir: "Thorium" },
  {
    id: "brave",
    title: "Brave",
    binaries: ["brave-browser", "brave"],
    configDir: join("BraveSoftware", "Brave-Browser"),
  },
  {
    id: "chrome",
    title: "Chrome",
    binaries: ["google-chrome", "google-chrome-stable", "chrome"],
    configDir: "google-chrome",
  },
];

const configRoot = (): string => process.env["XDG_CONFIG_HOME"] || join(homedir(), ".config");

export function userDataDir(def: BrowserDef): string {
  return join(configRoot(), def.configDir);
}

function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Absolute path of an executable found on `PATH` or in `~/.local/bin`. */
function findExecutable(names: readonly string[]): string | undefined {
  const dirs = [...(process.env["PATH"] ?? "").split(delimiter), join(homedir(), ".local", "bin")];
  for (const name of names) {
    for (const dir of dirs) {
      const path = join(dir, name);
      if (dir !== "" && isExecutable(path)) return path;
    }
  }
  return undefined;
}

export interface Browser {
  def: BrowserDef;
  bin: string;
}

/**
 * The browser to open windows in. `auto` takes the first installed one, which is
 * also the one whose history is read, so suggestions and windows always agree.
 */
export function findBrowser(preference: string): Browser | undefined {
  const wanted = preference === "" || preference === "auto" ? BROWSERS : BROWSERS.filter((def) => def.id === preference);
  for (const def of wanted) {
    const bin = findExecutable(def.binaries);
    if (bin) return { def, bin };
  }
  return undefined;
}

/** Titles of the Chromium-family browsers that are installed, for an actionable error. */
export function installedTitles(): string[] {
  return BROWSERS.filter((def) => findExecutable(def.binaries)).map((def) => def.title);
}

export function profiles(dir: string): ProfileEntry[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const found: ProfileEntry[] = [];
  for (const name of names) {
    try {
      const info = statSync(join(dir, name, "History"));
      if (info.isFile()) found.push({ name, historyMtimeMs: info.mtimeMs });
    } catch {
      // Not a profile directory.
    }
  }
  return found;
}

/** The profile `--app` windows open in, and therefore the one to read suggestions from. */
export function currentProfile(dir: string): string {
  let localState: unknown;
  try {
    localState = JSON.parse(readFileSync(join(dir, "Local State"), "utf-8"));
  } catch {
    localState = undefined;
  }
  return pickProfile(localState, profiles(dir));
}

/** A profile is only usable for suggestions if its History file is there. */
export function hasHistory(dir: string, profile: string): boolean {
  return existsSync(join(dir, profile, "History"));
}
