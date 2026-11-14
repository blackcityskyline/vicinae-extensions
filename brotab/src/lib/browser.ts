import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

/** `$XDG_DATA_HOME` or `~/.local/share`, the way Vicinae and friends resolve it. */
export function dataHome(): string {
  return process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
}

/** The notes database `brotab-ng` also reads, so both see the same notes. */
export function stateDir(): string {
  return process.env.BROTAB_NG_HOME || join(dataHome(), "brotab-ng");
}

export function notesFile(): string {
  return join(stateDir(), "notes.sqlite");
}

/** `$XDG_CACHE_HOME` or `~/.cache`, where screenshots are written. */
export function cacheDir(): string {
  return join(process.env.XDG_CACHE_HOME || join(homedir(), ".cache"), "brotab-ng");
}

export function ensureStateDir(file: string): void {
  const dir = dirname(file);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/**
 * The browser holds `places.sqlite` open in WAL mode, and a read-only handle on it
 * fails with "database is locked" because SQLite still needs the shared-memory
 * file. Copying the database and its two side files takes 10–16 ms for 13 MB on
 * tmpfs, which is cheaper than any coordination with the browser.
 *
 * Writes cannot use this: the browser keeps an exclusive lock on the real file.
 * Those go through the add-on, which is the only process allowed to change it.
 */
export function withSnapshot<T>(profile: string, body: (database: DatabaseSync) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "brotab-"));
  try {
    for (const suffix of ["", "-wal", "-shm"]) {
      try {
        copyFileSync(join(profile, `places.sqlite${suffix}`), join(dir, `places.sqlite${suffix}`));
      } catch {
        // No WAL yet, or no shm; the plain file is enough for the query.
      }
    }

    const database = new DatabaseSync(join(dir, "places.sqlite"), { readOnly: true });
    try {
      return body(database);
    } finally {
      database.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

type Candidate = { profile: string; modified: number };

function looksLikeProfile(dir: string): boolean {
  return existsSync(join(dir, "prefs.js"));
}

/** Profiles sit one or two levels under the browser's config directory. */
function profilesUnder(root: string): Candidate[] {
  const found: Candidate[] = [];
  const consider = (dir: string) => {
    if (!looksLikeProfile(dir)) return;
    const places = join(dir, "places.sqlite");
    const newest = existsSync(places) ? statSync(places).mtimeMs : statSync(join(dir, "prefs.js")).mtimeMs;
    found.push({ profile: dir, modified: newest });
  };

  for (const entry of safeReaddir(root)) {
    consider(join(root, entry));
    for (const nested of safeReaddir(join(root, entry))) consider(join(root, entry, nested));
  }

  return found;
}

function safeReaddir(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

const ROOTS = ["zen", "firefox", "librewolf", ".mozilla/firefox", ".zen"];

/**
 * The browser profile to read. Firefox forks keep it under their config
 * directory; several profiles are possible, so the one whose history moved last
 * wins unless `BROTAB_NG_PROFILE` names one.
 */
export function findProfile(options: { config?: string; explicit?: string } = {}): string {
  const explicit = options.explicit ?? process.env.BROTAB_NG_PROFILE;
  if (explicit) {
    if (!looksLikeProfile(explicit)) throw new Error(`BROTAB_NG_PROFILE has no prefs.js: ${explicit}`);
    return explicit;
  }

  const config = options.config ?? process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
  const candidates = ROOTS.flatMap((root) => profilesUnder(join(config, root))).sort((a, b) => b.modified - a.modified);

  const chosen = candidates[0];
  if (!chosen) throw new Error(`No browser profile with prefs.js under ${config}`);
  return chosen.profile;
}
