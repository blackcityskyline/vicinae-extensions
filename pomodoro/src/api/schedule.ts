import { spawn } from "node:child_process";

import { shellQuote } from "../utils/prefs.ts";

// The deadline is kept by a detached shell, so a closed window and a dead
// worker do not stop it. It launches the `advance` command, which owns every
// transition, chime, notification and music change.
export const ADVANCE_DEEPLINK = "vicinae://launch/@black/pomodoro/advance";

export function advanceCommand(seconds: number): string {
	return `sleep ${Math.max(0, Math.round(seconds))}; exec vicinae ${shellQuote(ADVANCE_DEEPLINK)}`;
}

export function schedule(endsAt: number, now = Date.now()): number | null {
	try {
		const child = spawn("sh", ["-c", advanceCommand((endsAt - now) / 1000)], {
			detached: true,
			stdio: "ignore",
		});
		child.unref();
		return child.pid ?? null;
	} catch {
		return null;
	}
}
