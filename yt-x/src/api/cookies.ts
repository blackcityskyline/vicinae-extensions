import { execFile } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import type { Config } from "~/types";
import { cookieBrowserLine, cookieHeader, parseBrowserSpec, parseCookieRows } from "~/utils/cookies";

const run = promisify(execFile);

/** Browsers whose cookie database is a plain SQLite file. */
const FIREFOX = new Set(["firefox", "zen", "librewolf", "waterfox", "floorp"]);

/** Profile folders, as the browsers lay them out. */
const ROOTS = ["mozilla/firefox", "zen", "librewolf", "waterfox", "floorp"];

const SQL = (now: number): string =>
  `select name||char(9)||value from moz_cookies where host like '%youtube.com' and (expiry = 0 or expiry > ${now});`;

function expandHome(path: string, home: string): string {
  if (path === "~") return home;
  return path.startsWith("~/") ? `${home}/${path.slice(2)}` : path;
}

/** `CONFIG_BROWSER` first, then the browser the global yt-dlp config already uses. */
function specText(config: Config, configHome: string): string | undefined {
  if (config.cookiesBrowser.trim() !== "") return config.cookiesBrowser;
  try {
    return cookieBrowserLine(readFileSync(join(configHome, "yt-dlp", "config"), "utf8"));
  } catch {
    return undefined;
  }
}

function newest(directories: string[]): string | undefined {
  let best: { path: string; mtime: number } | undefined;
  for (const directory of directories) {
    try {
      const mtime = statSync(directory).mtimeMs;
      if (!best || mtime > best.mtime) best = { path: directory, mtime };
    } catch {
      // a browser this machine does not have
    }
  }
  return best?.path;
}

function database(profile: string | undefined, home: string, configHome: string): string | undefined {
  if (profile !== undefined) return join(expandHome(profile, home), "cookies.sqlite");

  const found: string[] = [];
  for (const root of ROOTS) {
    const base = root.startsWith("mozilla") ? join(home, root) : join(configHome, root);
    try {
      for (const entry of readdirSync(base)) {
        const candidate = join(base, entry);
        try {
          if (statSync(candidate).isDirectory()) found.push(candidate);
        } catch {
          // an entry removed while reading
        }
      }
    } catch {
      // a browser this machine does not have
    }
  }

  const directory = newest(found);
  return directory === undefined ? undefined : join(directory, "cookies.sqlite");
}

/**
 * The cookies a browser would send to youtube.com, or `""` when there is no browser to ask.
 * `immutable=1` reads the database while the browser holds it open.
 */
export async function youtubeCookies(
  config: Config,
  home: string = homedir(),
  configHome: string = process.env.XDG_CONFIG_HOME || join(home, ".config"),
): Promise<string> {
  const spec = parseBrowserSpec(specText(config, configHome) ?? "");
  if (spec === null || !FIREFOX.has(spec.browser)) return "";

  const file = database(spec.profile, home, configHome);
  if (file === undefined) return "";

  try {
    const { stdout } = await run(
      "sqlite3",
      [`file:${file}?immutable=1`, SQL(Date.now())],
      { timeout: 10_000, maxBuffer: 4 * 1024 * 1024 },
    );
    return cookieHeader(parseCookieRows(stdout));
  } catch {
    return "";
  }
}
