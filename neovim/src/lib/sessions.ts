/**
 * persistence.nvim names a session after the directory it was saved in: every
 * separator becomes `%` and a literal `%` becomes `%%`. The decoding is its
 * contract, not ours, so it is the one piece worth pinning with a test.
 */

import fs from "node:fs";
import path from "node:path";

import { sessionsDir } from "~/lib/paths";

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
