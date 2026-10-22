import { exec } from "node:child_process";
import { closeMainWindow, showHUD, showToast } from "@vicinae/api";
import { getAnnotator } from "../annotators";
import { getSavePath, saveImageFile } from "./filesystem";
import { notifyAnnotation } from "./notify";
import type { Preferences } from "./preferences";

/**
 * Returns true if the preview should be reloaded (auto-mode annotator),
 * false if the user is saving manually or an error occurred.
 */
export const annotateWith = async (
	imagePath: string,
	toolId: string,
): Promise<boolean> => {
	const annotator = getAnnotator(toolId);
	if (!annotator || annotator.id === "none") return false;

	if (annotator.mode === "auto") {
		await closeMainWindow();
		try {
			await annotator.annotate(imagePath);
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
		await annotator.annotate(imagePath);
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

/**
 * The configured step after a capture in the main command. Returns true when
 * the annotator rewrote the file, so the caller reloads the preview and the
 * copy/save that follow pick up the annotated bytes.
 *
 * `notify` needs a file that outlives the command, because the click can come
 * later; a temp capture dies with the worker. `savedPath` is the caller's save,
 * when it already made one.
 */
export const applyAnnotationFlow = async (
	imagePath: string,
	prefs: Preferences,
	annotatorId: string | null,
	savedPath: string | null = null,
): Promise<boolean> => {
	const flow = prefs.annotation_flow ?? "after_capture";
	if (flow === "off" || !annotatorId) return false;

	const annotator = getAnnotator(annotatorId);
	if (!annotator || annotator.id === "none") return false;

	if (flow === "notify") {
		const target =
			savedPath ?? saveImageFile(imagePath, getSavePath(prefs));
		notifyAnnotation(target, annotator);
		return false;
	}

	return annotateWith(imagePath, annotatorId);
};
