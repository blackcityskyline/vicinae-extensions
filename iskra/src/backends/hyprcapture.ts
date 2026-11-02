import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { CaptureBackend, CaptureMode } from "./types";
import { CaptureCancelled } from "./errors";
import { isCommandAvailable, run } from "./utils";

/**
 * HyprCapture's native overlay. The plugin draws the selector, saves the file,
 * copies it and keeps its own thumbnail; this backend only starts it and waits.
 *
 * Measured on Hyprland 0.56.2 + HyprCapture 0.4.2 (docs/audits/hyprcapture.md):
 * `hyprctl eval` returns `ok` in 30-70 ms, long before the overlay exists.
 * `hyprcapture-ui` then lives for the selection and about five more seconds of
 * thumbnail. Success adds a file to the configured save directory and a
 * `thumbnail-preview-*` file to `/dev/shm/hyprcapture-$UID`; Esc adds neither.
 */

/** Only these three strings ever reach the Lua call. */
export const OPEN_COMMAND: Record<"area" | "window" | "full", string> = {
	area: "hl.plugin.hyprcapture.open('region')",
	window: "hl.plugin.hyprcapture.open('window')",
	full: "hl.plugin.hyprcapture.open('fullscreen')",
};

export const hyprcaptureOpenCommand = (mode: CaptureMode): string => {
	const command = OPEN_COMMAND[mode as keyof typeof OPEN_COMMAND];
	if (!command) {
		throw new Error(`HyprCapture's overlay cannot capture "${mode}"`);
	}
	return command;
};

export const pluginListHasHyprcapture = (output: string): boolean =>
	/hyprcapture/i.test(output);

const hyprcaptureThumbnailDir = (): string =>
	`/dev/shm/hyprcapture-${typeof process.getuid === "function" ? process.getuid() : 0}`;

const thumbnailFiles = (): Set<string> => {
	try {
		return new Set(
			readdirSync(hyprcaptureThumbnailDir()).filter((name) =>
				name.startsWith("thumbnail-preview-"),
			),
		);
	} catch {
		return new Set();
	}
};

const runningPids = (): number[] => {
	try {
		const output = execFileSync("pgrep", ["-x", "hyprcapture-ui"], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		});
		return output
			.split("\n")
			.map((line) => Number(line.trim()))
			.filter((pid) => Number.isSafeInteger(pid) && pid > 0);
	} catch {
		return [];
	}
};

const sleep = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

/** Where HyprCapture saves, with the shell variables the option carries expanded. */
const expandHyprPath = (value: string): string => {
	let path = value.trim();
	if (path.startsWith("~")) path = join(homedir(), path.slice(1));
	path = path.replace(/^\$HOME/, homedir());
	if (path.includes("$XDG_PICTURES_DIR")) {
		let pictures = process.env.XDG_PICTURES_DIR ?? "";
		if (!pictures) {
			try {
				pictures = run("xdg-user-dir", ["PICTURES"]);
			} catch {
				pictures = join(homedir(), "Pictures");
			}
		}
		path = path.replace(/^\$XDG_PICTURES_DIR/, pictures);
	}
	return path;
};

/**
 * `hyprctl getoption` prints the value on its first line and a `set: ...` line
 * after it. Reading the whole output would put that second line in the path.
 */
export const saveDirectoryFromOption = (output: string): string | null => {
	const value = (output.split("\n")[0] ?? "").replace(/^str:\s*/, "").trim();
	return value ? expandHyprPath(value) : null;
};

const saveDirectory = (): string | null => {
	try {
		return saveDirectoryFromOption(
			run("hyprctl", ["getoption", "plugin:hyprcapture:save_dir"]),
		);
	} catch {
		return null;
	}
};

const IMAGE_FILE = /\.(png|jpe?g|webp|jxl)$/i;

const newestImage = (directory: string | null, startedAt: number): string | null => {
	if (!directory) return null;
	try {
		const produced = readdirSync(directory)
			.filter((name) => IMAGE_FILE.test(name))
			.map((name) => join(directory, name))
			.filter((path) => {
				try {
					return statSync(path).mtimeMs >= startedAt;
				} catch {
					return false;
				}
			})
			.sort(
				(a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs,
			);
		return produced[0] ?? null;
	} catch {
		return null;
	}
};

export type OverlayWatch = {
	beforePids: Set<number>;
	beforeThumbnails: Set<string>;
	startedAt: number;
	saveDir: string | null;
	listPids: () => number[];
	listThumbnails: () => Set<string>;
	sleep: (ms: number) => Promise<void>;
	now: () => number;
	startTimeoutMs?: number;
};

export type OverlayResult = { path: string | null };

const newThumbnail = (
	watch: OverlayWatch,
	thumbnails: Set<string>,
): boolean => [...thumbnails].some((name) => !watch.beforeThumbnails.has(name));

/**
 * Waits for the overlay the plugin just started.
 *
 * A thumbnail that was not there before means the capture succeeded, even if
 * the helper already exited. A helper that starts and then exits without one
 * means the user pressed Esc. Neither appearing within the start window means
 * the plugin did not start at all, which is an error rather than a dismissal.
 */
export const waitForHyprcaptureOverlay = async (
	watch: OverlayWatch,
): Promise<OverlayResult> => {
	const startDeadline = watch.now() + (watch.startTimeoutMs ?? 2000);
	let captured = false;
	let started = false;

	while (watch.now() < startDeadline) {
		if (newThumbnail(watch, watch.listThumbnails())) captured = true;
		if (watch.listPids().some((pid) => !watch.beforePids.has(pid))) {
			started = true;
			break;
		}
		if (captured) break;
		await watch.sleep(25);
	}

	if (!started && !captured) {
		throw new Error(
			"HyprCapture did not start its overlay. Check `hyprctl plugin list` and that hyprcapture-ui is on PATH.",
		);
	}

	// The helper keeps its thumbnail on screen for about five seconds after the
	// file is written. Reopening Vicinae before it exits would put the launcher
	// under a live layer surface.
	while (watch.listPids().some((pid) => !watch.beforePids.has(pid))) {
		await watch.sleep(100);
	}

	if (captured || newThumbnail(watch, watch.listThumbnails())) {
		return { path: newestImage(watch.saveDir, watch.startedAt) };
	}
	throw new CaptureCancelled("HyprCapture capture cancelled");
};

let available: boolean | null = null;

/** One probe per worker process, like lib/noctalia.ts. */
export const hyprcaptureAvailable = (): boolean => {
	if (available === null) {
		available = false;
		if (!process.env.HYPRLAND_INSTANCE_SIGNATURE) return available;
		if (!isCommandAvailable("hyprcapture-ui")) return available;
		try {
			available = pluginListHasHyprcapture(run("hyprctl", ["plugin", "list"]));
		} catch {
			available = false;
		}
	}
	return available;
};

/** Test seam: a check can reset the once-per-process answer. */
export const resetHyprcaptureAvailability = (): void => {
	available = null;
};

export const hasVicinaeLayer = (layersJson: string): boolean => {
	try {
		const parsed = JSON.parse(layersJson) as Record<
			string,
			{ levels?: Record<string, { namespace?: string }[]> }
		>;
		for (const monitor of Object.values(parsed)) {
			for (const surfaces of Object.values(monitor.levels ?? {})) {
				for (const surface of surfaces) {
					if (surface.namespace === "vicinae") return true;
				}
			}
		}
		return false;
	} catch {
		return false;
	}
};

/**
 * Waits for the launcher's layer to go. A fullscreen HyprCapture frame is
 * frozen when `open` is called, so a launcher still on screen at that moment
 * would be in the shot. If Hyprland cannot answer, the measured 200 ms sleep
 * in capture.ts is the fallback.
 */
export const waitForVicinaeLayerGone = async (
	timeoutMs = 1500,
): Promise<boolean> => {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		try {
			if (!hasVicinaeLayer(run("hyprctl", ["layers", "-j"]))) return true;
		} catch {
			await sleep(200);
			return true;
		}
		await sleep(25);
	}
	return false;
};

export const hyprcaptureBackend: CaptureBackend = {
	id: "hyprcapture",
	displayName: "HyprCapture (overlay)",
	sessions: ["wayland"],
	wlrootsOnly: true,
	ownsCapture: true,
	// `open` has no monitor argument: fullscreen means the configured scope,
	// which is all monitors. Offering a per-monitor choice here would be a lie.
	supportedModes: ["area", "window", "full"],

	isAvailable: hyprcaptureAvailable,

	capture: async (mode: CaptureMode): Promise<string | void> => {
		const startedAt = Date.now();
		const beforePids = new Set(runningPids());
		const beforeThumbnails = thumbnailFiles();
		const saveDir = saveDirectory();

		run("hyprctl", ["eval", hyprcaptureOpenCommand(mode)]);
		const result = await waitForHyprcaptureOverlay({
			beforePids,
			beforeThumbnails,
			startedAt,
			saveDir,
			listPids: runningPids,
			listThumbnails: thumbnailFiles,
			sleep,
			now: Date.now,
		});
		return result.path ?? undefined;
	},
};
