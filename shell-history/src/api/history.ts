import { readFile } from "node:fs/promises";
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
 * How many entries per shell the list holds.
 *
 * Per shell, not overall: fish runs a lot on this machine and has five times
 * the entries of bash, so one shared cap would take every bash command out of
 * the list entirely.
 */
const CAP = 5000;

export async function readHistory(): Promise<HistoryRead> {
  const shells = Object.keys(HISTORY_PATHS) as Shell[];
  const histories = await Promise.all(
    shells.map(async (shell): Promise<Entry[]> => {
      try {
        return PARSERS[shell](await readFile(HISTORY_PATHS[shell], "utf8"));
      } catch {
        return [];
      }
    }),
  );

  const missing = shells.filter((shell, index) => histories[index]?.length === 0);
  // History files are written oldest first, so the newest entries are at the
  // end. Taking the first CAP kept 2025-12 to 2026-03 and dropped the most
  // recent six months, which is what the list showed until this was fixed.
  return { ok: true, value: mergeHistories(histories.map((history) => history.slice(-CAP))), missing };
}
