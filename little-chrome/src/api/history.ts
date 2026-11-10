import { execFile } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { environment } from "@vicinae/api";

import type { Blocklist } from "~/utils/blocklist.ts";
import { faviconSql, searchSql, type HistoryRow } from "~/utils/history-sql.ts";

const exec = promisify(execFile);

export interface HistoryItem {
  url: string;
  title: string;
  favicon?: string;
}

const SNAPSHOT = join(tmpdir(), "little-chrome-history.sqlite");
const FAVICON_SNAPSHOT = join(tmpdir(), "little-chrome-favicons.sqlite");

export const faviconDir = (): string => join(environment.supportPath, "favicons");

/**
 * The browser keeps its databases open, so query copies. Copied on every open
 * rather than cached: the copy is a few megabytes and the history is fresh.
 */
function snapshot(userDataDir: string, profile: string): { history: string; favicons?: string } {
  copyFileSync(join(userDataDir, profile, "History"), SNAPSHOT);
  try {
    copyFileSync(join(userDataDir, profile, "Favicons"), FAVICON_SNAPSHOT);
    return { history: SNAPSHOT, favicons: FAVICON_SNAPSHOT };
  } catch {
    return { history: SNAPSHOT };
  }
}

async function sqlite<T>(database: string, sql: string, attach?: string): Promise<T[]> {
  const args = attach ? ["-cmd", `ATTACH '${attach.replace(/'/g, "''")}' AS f`, "-json", database, sql] : ["-json", database, sql];
  let stdout: string;
  try {
    ({ stdout } = await exec("sqlite3", args, { maxBuffer: 16 * 1024 * 1024 }));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error("sqlite3 is not installed. Install it to read browser history.");
    }
    throw error;
  }
  return stdout.trim() === "" ? [] : (JSON.parse(stdout) as T[]);
}

/** Writes the favicons this result set needs into the support directory, and returns the paths that exist. */
async function cacheFavicons(database: string, rows: readonly HistoryRow[]): Promise<Map<string, string>> {
  const dir = faviconDir();
  const keys = [...new Set(rows.map((row) => row.bitmap).filter((key): key is string => !!key))];
  const missing = keys.filter((key) => !existsSync(join(dir, `${key}.png`)));

  if (missing.length > 0) {
    mkdirSync(dir, { recursive: true });
    const ids = missing.map((key) => Number.parseInt(key, 10)).filter((id) => Number.isFinite(id));
    if (ids.length > 0) {
      const images = await sqlite<{ key: string; data: string }>(database, faviconSql(ids), FAVICON_SNAPSHOT);
      for (const { key, data } of images) {
        writeFileSync(join(dir, `${key}.png`), Buffer.from(data, "hex"));
      }
    }
  }

  const icons = new Map<string, string>();
  for (const key of keys) {
    const path = join(dir, `${key}.png`);
    if (existsSync(path)) icons.set(key, path);
  }
  return icons;
}

/** Suggestions for `query`, best match first, already filtered against the blocklist. */
export async function searchHistory(
  userDataDir: string,
  profile: string,
  query: string,
  blocklist: Blocklist,
): Promise<HistoryItem[]> {
  const words = query.trim().split(/\s+/).filter(Boolean);
  const { history, favicons } = snapshot(userDataDir, profile);

  let rows: HistoryRow[];
  if (favicons) {
    try {
      rows = await sqlite<HistoryRow>(history, searchSql(words, blocklist, true), favicons);
    } catch {
      // A malformed or older Favicons database must not cost the user suggestions.
      rows = await sqlite<HistoryRow>(history, searchSql(words, blocklist, false));
    }
  } else {
    rows = await sqlite<HistoryRow>(history, searchSql(words, blocklist, false));
  }

  let icons = new Map<string, string>();
  try {
    icons = await cacheFavicons(history, rows);
  } catch {
    // Suggestions without icons are still usable.
  }

  return rows.map((row) => ({
    url: row.url,
    title: row.title ?? row.url,
    favicon: row.bitmap ? icons.get(row.bitmap) : undefined,
  }));
}
