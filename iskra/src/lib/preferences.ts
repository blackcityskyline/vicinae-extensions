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
	capture_order: string;
	annotation_tool: string;
	annotation_order: string;
	annotation_flow: AnnotationFlow;
	copy_to_clipboard: boolean;
	save_to_file: boolean;
	subfolder_format: string;
	filename_format: string;
	autoclose_vicinae: boolean;
	/**
	 * "native" hands the capture to the desktop's own tool: written straight to
	 * the save directory, with that tool's notification left intact, and no
	 * preview inside Vicinae.
	 */
	post_capture: "vicinae" | "native";
}

export const getPrefs = (): Preferences => getPreferenceValues<Preferences>();

export const expandPath = (p: string): string => p.replace(/^~/, os.homedir());
