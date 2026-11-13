/**
 * persistence.nvim names a session after the directory it was saved in: every
 * separator becomes `%` and a literal `%` becomes `%%`. The decoding is its
 * contract, not ours, so it is the one piece worth pinning with a test.
 */

import fs from "node:fs";
import path from "node:path";

import { type Entry, trackRecent, removeRecent } from "~/lib/entries";
import { sessionsDir, targetDirectory } from "~/lib/paths";

export type Session = {
  /** The decoded directory the session restores. */
  directory: string;
  /** The file to hand to `nvim -S`. */
  file: string;
  name: string;
  modified: Date;
  /** The directory may have been deleted after the session was saved. */
  missing: boolean;
};

export function decodeSessionPath(filename: string): string {
  const base = filename.replace(/\.(vim|lua)$/, "");
  return base
    .replace(/^%/, "/")
    .replace(/%%/g, "\u0000")
    .replace(/%/g, "/")
    .replace(/\u0000/g, "%");
}

/**
 * `nvim -S` runs its argument through `expand_filename`, so a `%` in the path is
 * read as "the current buffer" and the session is never sourced: measured as
 * `E499: Empty file name for '%'` on a real `%home%black.vim`. A leading
 * backslash makes the character literal.
 */
export function escapeNvimPath(file: string): string {
  return file.replace(/([\\%# ])/g, "\\$1");
}

export function sessionName(directory: string): string {
  return path.basename(directory) || directory;
}

export function readSessions(dir: string = sessionsDir()): Session[] {
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }

  const sessions: Session[] = [];
  for (const name of names) {
    if (!/\.(vim|lua)$/.test(name)) continue;
    try {
      const file = path.join(dir, name);
      const directory = decodeSessionPath(name);
      let missing = false;
      try {
        missing = !fs.statSync(directory).isDirectory();
      } catch {
        missing = true;
      }
      sessions.push({ directory, file, name: sessionName(directory), modified: fs.statSync(file).mtime, missing });
    } catch {
      // A session that vanished between readdir and stat is not worth an error row.
    }
  }

  return sessions.sort((left, right) => right.modified.getTime() - left.modified.getTime());
}

/** The persistence half of the list: `nvim -S` can restore these. */
export function sessionEntries(dir: string = sessionsDir()): Entry[] {
  return readSessions(dir).map((session) => ({
    id: `persistence:${path.basename(session.file)}`,
    name: session.name,
    path: session.directory,
    lastOpened: session.modified,
    source: "persistence",
    file: session.file,
    missing: session.missing,
  }));
}

type StoredRecent = { path?: unknown; name?: unknown; lastOpened?: unknown };

/**
 * The recent half: directories this extension opened, in its `supportPath`. A
 * corrupt file is an empty list, as upstream treats it.
 */
export function readRecentFile(file: string): Entry[] {
  let stored: unknown;
  try {
    stored = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return [];
  }
  if (!Array.isArray(stored)) return [];

  const entries: Entry[] = [];
  for (const item of stored as StoredRecent[]) {
    if (item === null || typeof item !== "object" || typeof item.path !== "string") continue;
    const when = typeof item.lastOpened === "string" ? new Date(item.lastOpened) : new Date(0);
    entries.push({
      id: `recent:${item.path}`,
      name: typeof item.name === "string" ? item.name : path.basename(item.path),
      path: item.path,
      lastOpened: Number.isNaN(when.getTime()) ? new Date(0) : when,
      source: "recent",
    });
  }
  return entries;
}

export function writeRecentFile(file: string, entries: Entry[]): void {
  const stored = entries
    .filter((entry) => entry.source === "recent")
    .map((entry) => ({ path: entry.path, name: entry.name, lastOpened: entry.lastOpened.toISOString() }));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(stored, null, 2));
}

/** Remember the directory a launch came from; failures leave the list as it was. */
export function recordRecent(target: string, file: string): void {
  try {
    writeRecentFile(file, trackRecent(readRecentFile(file), targetDirectory(target), new Date()));
  } catch {
    // A support directory that cannot be written is not worth failing a launch.
  }
}

export function forgetRecent(directory: string, file: string): void {
  writeRecentFile(file, removeRecent(readRecentFile(file), directory));
}
