import { closeMainWindow } from "@vicinae/api";
import { applyAnnotationFlow } from "./annotate";
import { copyToClipboard } from "./clipboard";
import { getSavePath, saveImageFile } from "./filesystem";
import type { Preferences } from "./preferences";

export type Delivery =
	/** The desktop tool saved it where the user wants it; there is nothing to preview. */
	| { kind: "native"; path: string }
	| { kind: "preview"; path: string }
	/** Autoclose: the launcher is gone, so there is nothing left to show. */
	| { kind: "closed" };

/**
 * Everything that happens to a screenshot between the capture tool and the
 * preview: annotate, copy, save, notify, close.
 *
 * Every capture command ends here, so the order is decided once. An annotator
 * that rewrites the file in place runs first, so the copy and the save carry the
 * annotated bytes. The copy comes before the save, because saving consumes the
 * temporary capture.
 */
export const deliverCapture = async (
	captured: string,
	prefs: Preferences,
): Promise<Delivery> => {
	// The desktop tool already wrote the screenshot to the save directory and
	// owns the notification pointing at it. Running the rest over it would save a
	// second copy under a fresh timestamp and show the preview this mode skips.
	if (prefs.post_capture === "native") {
		if (prefs.copy_to_clipboard) await copyToClipboard(captured, false);
		if (prefs.autoclose_vicinae) await closeMainWindow();
		return { kind: "native", path: captured };
	}

	const flow = prefs.annotation_flow ?? "after_capture";
	if (flow === "after_capture") await applyAnnotationFlow(captured, prefs);

	if (prefs.copy_to_clipboard) await copyToClipboard(captured, false);
	const saved = prefs.save_to_file
		? saveImageFile(captured, getSavePath(prefs))
		: null;

	// The notification's button runs the annotator after this command may be
	// gone, so it points at a file on disk, not at the temp capture.
	const path =
		flow === "notify"
			? ((await applyAnnotationFlow(captured, prefs, saved)) ?? saved ?? captured)
			: (saved ?? captured);

	if (prefs.autoclose_vicinae && (prefs.copy_to_clipboard || prefs.save_to_file)) {
		await closeMainWindow();
		return { kind: "closed" };
	}
	return { kind: "preview", path };
};
