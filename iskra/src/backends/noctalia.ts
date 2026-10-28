import { copyFileSync, readdirSync, readFileSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { CaptureBackend, CaptureMode } from "./types";
import { CaptureCancelled } from "./errors";
import { isCommandAvailable, run } from "./utils";
import {
	markNoctaliaDrive,
	noctaliaAnswers,
	noctaliaCaptureSupported,
	unmarkNoctaliaDrive,
} from "../lib/noctalia";

/**
 * Newer shells take per-call options, so the file can be requested where the
 * extension needs it. Noctalia still appends its own label and picks the
 * extension itself, so the name is a unique token and the produced file is
 * renamed onto the target.
 */
const MODERN_COMMAND: Record<CaptureMode, string> = {
	area: "screenshot-region",
	window: "screenshot-window",
	monitor: "screenshot-fullscreen",
	full: "screenshot-fullscreen",
};

/** Older shells (v5.3.0) have no options at all: only the command and a selector. */
const LEGACY_COMMAND: Partial<Record<CaptureMode, string>> = {
	area: "screenshot-region",
	monitor: "screenshot-fullscreen",
	full: "screenshot-fullscreen",
};

export const noctaliaCaptureArgs = (
	mode: CaptureMode,
	outputPath: string,
	outputName?: string,
): { args: string[]; token: string } => {
	const token = `iskra-${process.pid}-${Date.now()}`;
	const args = [
		"msg",
		MODERN_COMMAND[mode],
		"--save-to-file",
		"--no-copy-to-clipboard",
		"--no-annotate",
		"--no-pipe-to-command",
		"--format",
		"png",
		"--directory",
		dirname(outputPath),
		"--filename-pattern",
		token,
	];
	if (mode === "monitor" && outputName) args.push(outputName);
	// An unnamed monitor is the focused one, which is what fullscreen means.
	if (mode === "full") args.push("all");
	return { args, token };
};

export const noctaliaLegacyArgs = (
	mode: CaptureMode,
	outputName?: string,
): string[] => {
	const command = LEGACY_COMMAND[mode];
	if (!command) throw new Error(`Noctalia cannot capture "${mode}" on this version`);
	const args = ["msg", command];
	if (mode === "monitor" && outputName) args.push(outputName);
	if (mode === "full") args.push("all");
	return args;
};

// ponytail: a fixed timeout, because the IPC answers "ok" before the overlay
// closes and never reports a dismissal. A cancellation looks like a capture
// that produced nothing; raise the ceiling if long selections start failing.
const CAPTURE_TIMEOUT_MS = 120_000;

const sleep = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

const waitForToken = async (dir: string, token: string): Promise<string | null> => {
	const deadline = Date.now() + CAPTURE_TIMEOUT_MS;
	while (Date.now() < deadline) {
		const produced = readdirSync(dir).find((name) => name.startsWith(token));
		if (produced) return join(dir, produced);
		await sleep(100);
	}
	return null;
};

const IMAGE_FILE = /\.(png|jpe?g|webp|jxl)$/i;

/** Where the shell saves when it was not told otherwise. */
const picturesRoot = (): string => {
	const expand = (value: string): string =>
		value.replace(/^\$HOME/, homedir()).replace(/^~/, homedir());

	const fromEnv = process.env.XDG_PICTURES_DIR;
	if (fromEnv) return expand(fromEnv);
	try {
		const line = readFileSync(join(homedir(), ".config", "user-dirs.dirs"), "utf8")
			.split("\n")
			.find((entry) => entry.trim().startsWith("XDG_PICTURES_DIR="));
		const value = line?.split("=")[1]?.trim().replace(/^"|"$/g, "");
		if (value) return expand(value);
	} catch {
		// No user-dirs file: the conventional fallback below is all there is.
	}
	return join(homedir(), "Pictures");
};

const listImages = (root: string): Set<string> => {
	const found = new Set<string>();
	const walk = (dir: string, depth: number): void => {
		let entries;
		try {
			entries = readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			const full = join(dir, entry.name);
			if (entry.isDirectory() && depth > 0) walk(full, depth - 1);
			else if (entry.isFile() && IMAGE_FILE.test(entry.name)) found.add(full);
		}
	};
	walk(root, 2);
	return found;
};

/**
 * Older shells own the output path: no option can redirect them, so the only
 * file they hand over is one they wrote themselves into the configured folder.
 * The set of images before the call is the only identifier available, and the
 * first path outside it is the capture. The file is copied rather than moved,
 * because the shell's own notification still points at it.
 */
const captureLegacy = async (
	mode: CaptureMode,
	outputPath: string,
	outputName?: string,
): Promise<void> => {
	const root = picturesRoot();
	const before = listImages(root);
	// The shell runs the user's pipe pipeline on its own schedule; the marker
	// covers the whole window in which that pipeline may still start.
	markNoctaliaDrive();
	try {
		run("noctalia", noctaliaLegacyArgs(mode, outputName));

		const deadline = Date.now() + CAPTURE_TIMEOUT_MS;
		while (Date.now() < deadline) {
			const produced = [...listImages(root)].find((path) => !before.has(path));
			if (produced) {
				copyFileSync(produced, outputPath);
				return;
			}
			await sleep(150);
		}
		throw new CaptureCancelled("Noctalia capture cancelled");
	} finally {
		unmarkNoctaliaDrive();
	}
};

export const noctaliaBackend: CaptureBackend = {
	id: "noctalia",
	displayName: "Noctalia (built-in)",
	// The window command arrived with the per-call options; older shells can only
	// select a region or a monitor, and claiming otherwise would select them for a
	// capture they cannot serve instead of letting the fallback order decide.
	get supportedModes(): CaptureMode[] {
		return noctaliaCaptureSupported()
			? ["area", "window", "monitor", "full"]
			: ["area", "monitor", "full"];
	},
	targetsNamedOutput: true,

	isAvailable: () => isCommandAvailable("noctalia") && noctaliaAnswers(),

	capture: async (mode, outputPath, outputName) => {
		if (!noctaliaCaptureSupported()) {
			await captureLegacy(mode, outputPath, outputName);
			return;
		}
		const { args, token } = noctaliaCaptureArgs(mode, outputPath, outputName);
		run("noctalia", args);
		const produced = await waitForToken(dirname(outputPath), token);
		if (!produced) throw new CaptureCancelled("Noctalia capture cancelled");
		renameSync(produced, outputPath);
	},
};
