import { environment } from "@vicinae/api";
import { spawn } from "node:child_process";
import { join } from "node:path";

import { mpvArgs, playableUrl } from "../utils/music.ts";

// The worker dies when the command window closes; mpv, the chime and the
// scheduled advance must not.
const DETACHED = { detached: true, stdio: "ignore" } as const;

export function alive(pid: number | null): boolean {
	if (!pid) return false;
	try {
		process.kill(pid, 0);
		return true;
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

export function spawnMusic(source: string, volume: number): number | null {
	try {
		const child = spawn("mpv", mpvArgs(playableUrl(source, environment.assetsPath), volume), DETACHED);
		child.unref();
		return child.pid ?? null;
	} catch {
		return null;
	}
}

/** `pw-play` is on every PipeWire host; `paplay` covers a plain PulseAudio one. */
export function playChime(): void {
	const file = join(environment.assetsPath, "chime.oga");
	const player = spawn("pw-play", [file], DETACHED);
	player.on("error", () => {
		spawn("paplay", [file], DETACHED).unref();
	});
	player.unref();
}
