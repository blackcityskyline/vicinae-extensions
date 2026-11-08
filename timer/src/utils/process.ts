import { readFileSync } from "node:fs";

/**
 * A process started from a worker can end up as a zombie under Vicinae, and
 * `kill(pid, 0)` still succeeds on one. `/proc` reports the real state, so a
 * dead player is noticed instead of believed.
 */
export function alive(pid: number | null): boolean {
  if (!pid) return false;
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    const state = stat.slice(stat.lastIndexOf(")") + 2, stat.lastIndexOf(")") + 3);
    return state !== "Z" && state !== "X";
  } catch {
    return false;
  }
}

export function stop(pid: number | null): void {
  if (!alive(pid)) return;
  try {
    process.kill(pid as number, "SIGTERM");
  } catch {
    // It died between the check and the signal.
  }
}
