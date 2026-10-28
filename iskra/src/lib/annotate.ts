import { exec } from "node:child_process";
import { closeMainWindow, showHUD, showToast } from "@vicinae/api";
import type { AnnotatorBackend } from "../annotators/types";
import { launchDetached, run } from "../backends/utils";
import { getSavePath, saveImageFile } from "./filesystem";
import { notifyAnnotation } from "./notify";
import { getPrefs, type Preferences } from "./preferences";
import { resolveAnnotator } from "./tool-selection";

/**
 * An auto tool blocks until the editor closes; a manual one is only launched,
 * so the promise settles as soon as the launch itself has succeeded or failed.
 */
const launch = async (
	annotator: AnnotatorBackend,
	imagePath: string,
): Promise<void> => {
	const [binary, ...args] = annotator.command(imagePath);
	if (annotator.mode === "auto") run(binary, args);
	else await launchDetached(binary, args);
};

/**
 * Returns true if the preview should be reloaded (auto-mode annotator),
 * false if the user is saving manually or an error occurred.
 */
export const annotateWith = async (
	imagePath: string,
	annotator: AnnotatorBackend,
): Promise<boolean> => {
	if (annotator.mode === "auto") {
		await closeMainWindow();
		try {
			await launch(annotator, imagePath);
		} catch (e) {
			console.error("Annotator failed", e);
			exec("vicinae open");
			showHUD(`${annotator.displayName} failed or was cancelled`);
			return false;
		}
		exec("vicinae open");
		return true;
	}

	// Manual-save: open the editor in the background, stay in Vicinae
	try {
		await launch(annotator, imagePath);
	} catch (e) {
		console.error("Failed to launch annotator", e);
		showHUD(`Failed to open ${annotator.displayName}`);
		return false;
	}
	showToast({
		title: `Opened in ${annotator.displayName}`,
		message: "Save the file there, then use Refresh Preview to reload.",
	});
	return false;
};

/** Annotates with the active tool; same answer as `annotateWith`. */
export const annotateFile = async (imagePath: string): Promise<boolean> => {
	const annotator = await resolveAnnotator(getPrefs());
	if (!annotator) {
		showHUD("No annotation tool is available");
		return false;
	}
	return annotateWith(imagePath, annotator);
};

/**
 * The configured step after a capture, answering with the file a preview should
 * show.
 *
 * `notify` needs a file that outlives the command, because the click can come
 * later; a temp capture dies with the worker. It therefore saves the capture
 * itself when the caller has not (`savedPath`), whatever Save to File says, and
 * saving that copy consumes the temp capture, so the returned path is the only
 * one left to display.
 *
 * `after_capture` leaves the file where it is: an auto annotator rewrites it in
 * place and a manual one does not touch it.
 */
export const applyAnnotationFlow = async (
	imagePath: string,
	prefs: Preferences,
	savedPath: string | null = null,
): Promise<string | null> => {
	const flow = prefs.annotation_flow ?? "after_capture";
	if (flow === "off") return null;

	// Resolved here, not earlier: a tool can have gone away between the preview
	// and the click, and the configured order is what decides then.
	const annotator = await resolveAnnotator(prefs);
	if (!annotator) return null;

	if (flow === "notify") {
		const target = savedPath ?? saveImageFile(imagePath, getSavePath(prefs));
		notifyAnnotation(target, annotator);
		return target;
	}

	await annotateWith(imagePath, annotator);
	return imagePath;
};
