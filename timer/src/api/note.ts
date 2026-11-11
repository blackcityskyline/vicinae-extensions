import { readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";

import { appendLogEntry, expandHome, formatEntry, notePathFor, type Entry } from "~/utils/tasks.ts";

/**
 * The note behind the *Note File* preference. A directory means the daily note
 * named after today; a `*.md` path is that file; anything else is read as a
 * directory, so a path that does not exist yet still has somewhere to go.
 */
export function notePath(setting: string, now: Date): string | null {
  const path = expandHome(setting, homedir());
  if (!path) return null;
  let isDirectory = false;
  try {
    isDirectory = statSync(path).isDirectory();
  } catch {
    // Missing: the extension decides.
  }
  return notePathFor(setting, isDirectory, now, homedir());
}

/** Contents of the note, or undefined when it cannot be read. */
export function readNote(path: string): string | undefined {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return undefined;
  }
}

/**
 * Appends one entry under its task in the note's log section. Returns the reason
 * it could not be written, or undefined on success; a timer has already fired or
 * been cancelled by then, so the caller can only report the failure.
 */
export function writeEntry(noteFile: string, task: string, entry: Entry): string | undefined {
  const content = readNote(noteFile);
  if (content === undefined) return `Could not read ${noteFile}`;
  try {
    writeFileSync(noteFile, appendLogEntry(content, task, formatEntry(entry)));
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
