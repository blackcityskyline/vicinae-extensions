import { Clipboard, closeMainWindow, showHUD, showToast } from "@vicinae/api";

/** Resolves to whether the text reached the clipboard; a failure has already been shown. */
export const copyTextToClipboard = async (text: string): Promise<boolean> => {
	try {
		await Clipboard.copy(text);
		return true;
	} catch (e) {
		console.error("Failed to copy text to clipboard", e);
		showHUD("Clipboard copy failed");
		return false;
	}
};

export const copyToClipboard = async (
	imagePath: string,
	autoClose = true,
): Promise<void> => {
	try {
		await Clipboard.copy({ file: imagePath });
		showToast({ title: "Copied to clipboard" });
	} catch (e) {
		console.error("Failed to copy image to clipboard", e);
		showHUD("Clipboard copy failed");
		return;
	}
	if (autoClose) closeMainWindow();
};
