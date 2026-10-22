import { getPreferenceValues } from "@vicinae/api";
import os from "node:os";

/**
 * What happens with the annotator after a capture in the main command:
 * open it, announce the screenshot with a button that opens it, or leave it to
 * the preview.
 */
export type AnnotationFlow = "after_capture" | "notify" | "off";

export interface Preferences {
	screenshot_path: string;
	screenshot_tool: string;
	annotation_tool: string;
	annotation_flow: AnnotationFlow;
	copy_to_clipboard: boolean;
	save_to_file: boolean;
	subfolder_format: string;
	filename_format: string;
	autoclose_vicinae: boolean;
	post_capture: "vicinae" | "native";
}

export const getPrefs = (): Preferences => getPreferenceValues<Preferences>();

/**
 * True when the capture should be handed to the desktop's own screenshot tool:
 * written straight to the save directory, with that tool's notification left
 * intact, and no preview inside Vicinae.
 */
export const isNativeHandoff = (): boolean =>
	getPrefs().post_capture === "native";

export const expandPath = (p: string): string => p.replace(/^~/, os.homedir());
