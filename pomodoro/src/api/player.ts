import { environment } from "@vicinae/api";
import { spawn } from "node:child_process";
import { join } from "node:path";

import { mpvArgs, playableUrl } from "../utils/music.ts";

// The worker dies when the command window closes; mpv, the chime and the
// scheduled deadline must not.
const DETACHED = { detached: true, stdio: "ignore" } as const;

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
