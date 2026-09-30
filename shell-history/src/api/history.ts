import { open, readFile } from "node:fs/promises";
import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { mergeHistories, parseBash, parseFish, parseZsh, type Entry, type Shell } from "~/utils/history";

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

const PARSERS = { bash: parseBash, fish: parseFish, zsh: parseZsh } as const;

/**
 * How much of a history file to read, generously: reading the whole 1.6 MB
 * fish history took 116 ms to parse against 15 ms for its last 400 KB, and the
 * list never shows more than the cap either way. Anything past the cap is
 * dropped after parsing, so over-reading costs nothing but a few KB.
 */
const BYTES_PER_ENTRY = 256;

async function readTail(path: string, entries: number): Promise<{ text: string; truncated: boolean }> {
  const { size } = await stat(path);
  const want = Math.min(size, Math.max(64 * 1024, entries * BYTES_PER_ENTRY));

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

export async function readHistory(maxEntries: number): Promise<HistoryRead> {
  const shells = Object.keys(HISTORY_PATHS) as Shell[];
  const histories = await Promise.all(
    shells.map(async (shell): Promise<Entry[]> => {
      let text: string;
      let truncated: boolean;
      try {
        ({ text, truncated } = await readTail(HISTORY_PATHS[shell], maxEntries));
      } catch {
        return [];
      }

      const parsed = PARSERS[shell](text);
      // Cutting mid-entry leaves a partial command at the front of the text.
      // Dropping it is better than showing half a command you could run.
      const usable = truncated ? parsed.slice(1) : parsed;
      return usable.slice(-maxEntries);
    }),
  );

  const missing = shells.filter((shell, index) => histories[index]?.length === 0);
  return { ok: true, value: mergeHistories(histories), missing };
}
