import type { Config } from "~/types";

import { splitWords as splitArgs } from "./shell-words";

/**
 * Read the `CONFIG_*` assignments out of yt-x's config file.
 *
 * The file is a shell script, but only variable assignments matter here, so
 * parsing them is safer than sourcing a file this extension does not own.
 */
export function parseAssignments(text: string): Record<string, string> {
  const values: Record<string, string> = {};

  for (const line of text.split("\n")) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!match) continue;
    values[match[1]!] = unquote(match[2]!);
  }

  return values;
}

function unquote(raw: string): string {
  const value = raw.trim();

  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value
      .slice(1, -1)
      .replace(/\\(["\\$`])/g, "$1");
  }
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }

  return value.replace(/\s+#.*$/, "").trim();
}

/** `~/Music` and `$HOME/Music` mean the same folder as they do in a shell. */
export function expandHome(path: string, home: string): string {
  for (const prefix of ["${HOME}/", "$HOME/", "~/"]) {
    if (path.startsWith(prefix)) return `${home}/${path.slice(prefix.length)}`;
  }
  for (const exact of ["${HOME}", "$HOME", "~"]) {
    if (path === exact) return home;
  }
  return path;
}

/** A bare `$EDITOR` in the config file is a reference, not a command name. */
function resolveVariable(value: string, env: NodeJS.ProcessEnv): string {
  const name = /^\$(?:\{([A-Za-z_][A-Za-z0-9_]*)\}|([A-Za-z_][A-Za-z0-9_]*))$/.exec(value.trim());
  if (!name) return value;
  return env[name[1] ?? name[2]!] ?? "";
}

function integer(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function flag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  const normalised = value.trim().toLowerCase();
  if (normalised === "true") return true;
  if (normalised === "false") return false;
  return fallback;
}

/**
 * Resolve the values the extension reads. `YT_X_*` environment variables win
 * over the config file, exactly as they do inside yt-x.
 */
export function buildConfig(values: Record<string, string>, env: NodeJS.ProcessEnv): Config {
  const pick = (key: string, name: string, fallback: string): string =>
    env[`YT_X_${name}`] ?? values[key] ?? fallback;

  const home = env.HOME ?? "";
  const player = pick("CONFIG_PLAYER", "PLAYER", "mpv").trim() || "mpv";
  const playerName = player.toUpperCase();
  const playerArgs = pick(`CONFIG_${playerName}_ARGS`, `${playerName}_ARGS`, "");

  const configHome = env.XDG_CONFIG_HOME || `${home}/.config`;
  const cacheHome = env.XDG_CACHE_HOME || `${home}/.cache`;
  const appName = env.YT_X_APP_NAME || "yt-x";

  const downloadDir = pick("CONFIG_DOWNLOAD_DIR", "DOWNLOAD_DIR", "~/Videos/yt-x").trim();
  const editor = resolveVariable(pick("CONFIG_EDITOR", "EDITOR", ""), env).trim() || (env.EDITOR ?? "").trim();

  return {
    player,
    playerArgs: splitArgs(playerArgs),
    ytDlpOpts: splitArgs(pick("CONFIG_YT_DLP_OPTS", "YT_DLP_OPTS", "")),
    downloadDir: expandHome(downloadDir || "~/Videos/yt-x", home),
    cookiesBrowser: pick("CONFIG_BROWSER", "BROWSER", "").trim(),
    perPage: integer(pick("CONFIG_PER_PAGE", "PER_PAGE", "30"), 30, 1, 50),
    editor,
    noOfRecent: integer(pick("CONFIG_NO_OF_RECENT", "NO_OF_RECENT", "10"), 10, 1, 500),
    enumerateDownloads: flag(pick("CONFIG_DOWNLOADS_ENUMERATE", "ENUMERATE_DOWNLOADS", "false"), false),
    searchHistory: flag(pick("CONFIG_ENABLE_SEARCH_HISTORY", "ENABLE_SEARCH_HISTORY", "true"), true),
    upNext: flag(pick("CONFIG_UP_NEXT", "UP_NEXT", "true"), true),
    configHome,
    configDir: `${configHome}/${appName}`,
    cacheDir: `${cacheHome}/${appName}`,
  };
}
