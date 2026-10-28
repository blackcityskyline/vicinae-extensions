import { exec } from "node:child_process";
import { existsSync, mkdirSync, statSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import { closeMainWindow, showHUD } from "@vicinae/api";
import { CaptureCancelled } from "../backends/errors";
import type { CaptureBackend, CaptureMode } from "../backends/types";
import { stderrOf } from "../backends/utils";
import { TEMP_PATH, getSavePath } from "./filesystem";
import { getPrefs } from "./preferences";

/** What to capture, beyond the mode itself. */
export type CaptureTarget = {
	/** A monitor by the name its backend lists it under. */
	outputName?: string;
	/** An explicit `x,y wxh` region, for backends that take a geometry. */
	region?: string;
};

/** Resolves to the file the capture was written to, or null when nothing was captured. */
export const captureScreenshot = async (
	backend: CaptureBackend,
	mode: CaptureMode,
	{ outputName, region }: CaptureTarget = {},
): Promise<string | null> => {
	if (!backend.supportedModes.includes(mode)) {
		showHUD(`${backend.displayName} does not support "${mode}" capture`);
		return null;
	}

	if (region !== undefined && !backend.captureRegion) {
		showHUD(`${backend.displayName} cannot capture a chosen region`);
		return null;
	}

	const prefs = getPrefs();
	// Native hand-off writes straight to the save directory: the desktop tool's
	// notification then refers to a file that persists, instead of a temporary
	// one the extension deletes.
	const native = prefs.post_capture === "native";
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
		await new Promise((resolve) => setTimeout(resolve, 200));
		if (region !== undefined) {
			await backend.captureRegion!(region, target);
		} else {
			await backend.capture(mode, target, outputName, { notify: native });
		}
		exec("vicinae open");
		// Some tools exit cleanly when the user dismisses the selector
		// (gnome-screenshot -a among them) and simply write nothing.
		if (!existsSync(target)) return null;
		return statSync(target).mtimeMs > before ? target : null;
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
