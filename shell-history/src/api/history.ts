import { open, readFile, rename, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  mergeHistories,
  parseBash,
  parseFish,
  parseZsh,
  removeEntry,
  type Entry,
  type EntryLimit,
  type Shell,
} from "~/utils/history";

export type HistoryRead = { ok: true; value: Entry[]; missing: Shell[] } | { ok: false; message: string };

/**
 * Default paths. zsh and bash honour HISTFILE, which is set in the shell's
 * configuration and not exported, so an extension cannot see it; a shell with a
 * non-default HISTFILE gets its commands added to the list below.
 */
export const HISTORY_PATHS: Record<Shell, string> = {
  bash: join(homedir(), ".bash_history"),
  fish: join(homedir(), ".local/share/fish/fish_history"),
  zsh: join(homedir(), ".zsh_history"),
};

export type HistoryWrite = { ok: true } | { ok: false; message: string };

/**
 * Replaces a history file in one step, keeping its mode: a partial write would
 * leave a shell with a mangled history, and the file is the user's data. The
 * temp file sits next to it so the rename stays on one filesystem.
 */
async function rewrite(path: string, text: string): Promise<void> {
  const { mode } = await stat(path);
  const temporary = `${path}.vicinae-${process.pid}`;
  await writeFile(temporary, text, { mode });
  await rename(temporary, path);
}

/**
 * Removes one command from its shell's history file. A shell that is running
 * keeps its own copy in memory and writes it back on exit, so the entry can
 * return; the README says so rather than pretending otherwise.
 */
export async function deleteEntry(shell: Shell, command: string, when?: number): Promise<HistoryWrite> {
  const path = HISTORY_PATHS[shell];
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    return { ok: false, message: `${path} could not be read` };
  }

  const next = removeEntry(text, shell, { command, when });
  if (next === text) return { ok: false, message: `Not found in ${path}` };

  try {
    await rewrite(path, next);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
  return { ok: true };
}

/** Empties every history file that exists. */
export async function clearHistories(): Promise<HistoryWrite> {
  const failed: string[] = [];
  for (const shell of Object.keys(HISTORY_PATHS) as Shell[]) {
    const path = HISTORY_PATHS[shell];
    try {
      await rewrite(path, "");
    } catch {
      // A shell with no history file has nothing to clear.
      failed.push(path);
    }
  }
  return failed.length === Object.keys(HISTORY_PATHS).length
    ? { ok: false, message: "No history file could be written" }
    : { ok: true };
}

const PARSERS = { bash: parseBash, fish: parseFish, zsh: parseZsh } as const;

/**
 * How much of a history file to read, generously: reading the whole 1.6 MB
 * fish history took 116 ms to parse against 15 ms for its last 400 KB, and the
 * list never shows more than the cap either way. Anything past the cap is
 * dropped after parsing, so over-reading costs nothing but a few KB.
 */
const BYTES_PER_ENTRY = 256;

async function readTail(path: string, limit: EntryLimit): Promise<{ text: string; truncated: boolean }> {
  const { size } = await stat(path);
  const want = limit === "all" ? size : Math.min(size, Math.max(64 * 1024, limit * BYTES_PER_ENTRY));

  if (want >= size) return { text: await readFile(path, "utf8"), truncated: false };

  const handle = await open(path, "r");
  try {
    const buffer = Buffer.alloc(want);
    await handle.read(buffer, 0, want, size - want);
    return { text: buffer.toString("utf8"), truncated: true };
  } finally {
    await handle.close();
  }
}

export async function readHistory(limit: EntryLimit): Promise<HistoryRead> {
  const shells = Object.keys(HISTORY_PATHS) as Shell[];
  const histories = await Promise.all(
    shells.map(async (shell): Promise<Entry[]> => {
      let text: string;
      let truncated: boolean;
      try {
        ({ text, truncated } = await readTail(HISTORY_PATHS[shell], limit));
      } catch {
        return [];
      }

      const parsed = PARSERS[shell](text);
      // Cutting mid-entry leaves a partial command at the front of the text.
      // Dropping it is better than showing half a command you could run.
      const usable = truncated ? parsed.slice(1) : parsed;
      return limit === "all" ? usable : usable.slice(-limit);
    }),
  );

  const missing = shells.filter((shell, index) => histories[index]?.length === 0);
  return { ok: true, value: mergeHistories(histories), missing };
}
