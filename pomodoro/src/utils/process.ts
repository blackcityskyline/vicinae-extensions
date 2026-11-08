import { readFileSync } from "node:fs";

/**
 * A process we started can end up as a zombie under Vicinae, and `kill(pid, 0)`
 * still succeeds for one. `/proc` reports the real state, so a stopped player
 * is noticed and restarted instead of being believed.
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

const SHELLS = new Set(["sh", "dash", "bash"]);

/** True while the deadline is still held by its shell, i.e. has not fired yet. */
export function pendingDeadline(pid: number | null): boolean {
	if (!alive(pid)) return false;
	try {
		return SHELLS.has(readFileSync(`/proc/${pid}/comm`, "utf8").trim());
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
