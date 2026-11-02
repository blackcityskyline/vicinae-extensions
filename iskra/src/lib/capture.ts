import { exec } from "node:child_process";
import { existsSync, mkdirSync, statSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import { closeMainWindow, showHUD } from "@vicinae/api";
import { CaptureCancelled } from "../backends/errors";
import { waitForVicinaeLayerGone } from "../backends/hyprcapture";
import type { CaptureBackend, CaptureMode } from "../backends/types";
import { stderrOf } from "../backends/utils";
import { TEMP_PATH, getSavePath } from "./filesystem";
import { getPrefs } from "./preferences";

/** What to capture, beyond the mode itself. */
export type CaptureRequest = {
	/** A monitor by the name its backend lists it under. */
	outputName?: string;
	/** An explicit `x,y wxh` region, for backends that take a geometry. */
	region?: string;
	/**
	 * Write straight to the save directory (native hand-off) or to the
	 * temporary file. Defaults to the Capture Hand-off preference; a scan needs
	 * the temporary file whatever that says.
	 */
	native?: boolean;
	/** Extra wait after the launcher is closed, before the capture starts. */
	delayMs?: number;
};

/**
 * A capture that produced a file the preview owns, or one a backend took over
 * completely. The second carries the file only when the backend could find it
 * (HyprCapture's native overlay does not return its path).
 */
export type CaptureResult =
	| { kind: "file"; path: string }
	| { kind: "handoff"; path?: string };

const sleep = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

/** Resolves to the file the capture was written to, or null when nothing was captured. */
export const captureScreenshot = async (
	backend: CaptureBackend,
	mode: CaptureMode,
	{ outputName, region, native: handoff, delayMs }: CaptureRequest = {},
): Promise<CaptureResult | null> => {
	if (!backend.supportedModes.includes(mode)) {
		showHUD(`${backend.displayName} does not support "${mode}" capture`);
		return null;
	}

	if (region !== undefined && !backend.captureRegion) {
		showHUD(`${backend.displayName} cannot capture a chosen region`);
		return null;
	}

	if (backend.ownsCapture) {
		try {
			await closeMainWindow();
			if (!(await waitForVicinaeLayerGone())) {
				showHUD("Vicinae is still visible; close it and try again");
				exec("vicinae open");
				return null;
			}
			if (delayMs) await sleep(delayMs);
			const produced = await backend.capture(mode, TEMP_PATH, outputName, {
				notify: false,
			});
			exec("vicinae open");
			return {
				kind: "handoff",
				...(typeof produced === "string" ? { path: produced } : {}),
			};
		} catch (e) {
			exec("vicinae open");
			if (e instanceof CaptureCancelled) return null;
			const stderr = stderrOf(e);
			const detail = stderr.split("\n").pop() || (e as Error).message;
			showHUD(`${backend.displayName} failed: ${detail}`);
			return null;
		}
	}

	const prefs = getPrefs();
	// Native hand-off writes straight to the save directory: the desktop tool's
	// notification then refers to a file that persists, instead of a temporary
	// one the extension deletes.
	const native = handoff ?? prefs.post_capture === "native";
	const target = native ? getSavePath(prefs) : TEMP_PATH;
	if (native) mkdirSync(dirname(target), { recursive: true });
	// The native target is the user's own screenshot directory, and nothing
	// reserves the formatted filename there: a name the user has captured before
	// — certain with a filename_format that omits %S, and reachable on the
	// default one by shooting twice in the same second — already exists. Existence
	// alone would then hand back that old screenshot and report it as saved.
	const before = existsSync(target) ? statSync(target).mtimeMs : -1;

	try {
		if (!native && existsSync(TEMP_PATH)) unlinkSync(TEMP_PATH);
		await closeMainWindow();
		// The compositor animates the launcher out, and a capture started in the
		// same tick grabs the fading frame: the launcher would sit in the shot.
		// The 200 ms is the measured default; a caller can ask for longer.
		await sleep(200 + (delayMs ?? 0));
		if (region !== undefined) {
			await backend.captureRegion!(region, target);
		} else {
			await backend.capture(mode, target, outputName, { notify: native });
		}
		exec("vicinae open");
		// Some tools exit cleanly when the user dismisses the selector
		// (gnome-screenshot -a among them) and simply write nothing.
		if (!existsSync(target)) return null;
		return statSync(target).mtimeMs > before ? { kind: "file", path: target } : null;
	} catch (e) {
		exec("vicinae open");
		// Backends raise CaptureCancelled when the user backed out, and that is
		// the only outcome worth passing over in silence. Everything else — a
		// missing helper program, an unsupported compositor protocol, a tool that
		// produced nothing within its timeout — gets reported.
		if (e instanceof CaptureCancelled) return null;
		const stderr = stderrOf(e);
		const detail = stderr.split("\n").pop() || (e as Error).message;
		showHUD(`${backend.displayName} failed: ${detail}`);
		return null;
	}
};
