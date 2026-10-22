import { readdirSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import type { CaptureBackend, CaptureMode } from "./types";
import { CaptureCancelled } from "./errors";
import { isCommandAvailable, run } from "./utils";
import { noctaliaAnswers, noctaliaCaptureSupported } from "../lib/noctalia";

/**
 * Noctalia always appends its own label to the filename it is given and picks
 * the extension from its config, so the exact target name cannot be requested.
 * Every capture therefore writes into the target's directory under a token that
 * is unique to this call, and the file that appears is renamed onto the target.
 */
const COMMAND: Record<CaptureMode, string> = {
	area: "screenshot-region",
	window: "screenshot-window",
	monitor: "screenshot-fullscreen",
	full: "screenshot-fullscreen",
};

export const noctaliaCaptureArgs = (
	mode: CaptureMode,
	outputPath: string,
	outputName?: string,
): { args: string[]; token: string } => {
	const token = `vscrot-${process.pid}-${Date.now()}`;
	const args = [
		"msg",
		COMMAND[mode],
		"--save-to-file",
		"--no-copy-to-clipboard",
		"--no-annotate",
		"--format",
		"png",
		"--directory",
		dirname(outputPath),
		"--filename-pattern",
		token,
	];
	// Without a named output the shell's own monitor list is the honest picker.
	if (mode === "monitor") args.push(outputName ?? "pick");
	return { args, token };
};

// ponytail: a fixed timeout, because the IPC answers "ok" before the overlay
// closes and never reports a dismissal. A cancellation looks like a capture
// that produced nothing; raise the ceiling if long selections start failing.
const CAPTURE_TIMEOUT_MS = 120_000;

const waitForFile = async (dir: string, token: string): Promise<string | null> => {
	const deadline = Date.now() + CAPTURE_TIMEOUT_MS;
	while (Date.now() < deadline) {
		const produced = readdirSync(dir).find((name) => name.startsWith(token));
		if (produced) return join(dir, produced);
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	return null;
};

export const noctaliaBackend: CaptureBackend = {
	id: "noctalia",
	displayName: "Noctalia (built-in)",
	supportedModes: ["area", "window", "monitor", "full"],
	targetsNamedOutput: true,

	isAvailable: () =>
		isCommandAvailable("noctalia") &&
		noctaliaAnswers() &&
		noctaliaCaptureSupported(),

	capture: async (mode, outputPath, outputName) => {
		const { args, token } = noctaliaCaptureArgs(mode, outputPath, outputName);
		run("noctalia", args);
		const produced = await waitForFile(dirname(outputPath), token);
		if (!produced) throw new CaptureCancelled("Noctalia capture cancelled");
		renameSync(produced, outputPath);
	},
};
