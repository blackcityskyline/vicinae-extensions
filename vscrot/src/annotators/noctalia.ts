import type { AnnotatorBackend } from "./types";
import { isCommandAvailable, launchDetached } from "../backends/utils";

// Noctalia's built-in editor, driven over its own IPC. It never overwrites the
// source: saving writes a new PNG into Noctalia's screenshot folder, so there is
// no file for the preview to reload.
export const noctaliaAnnotator: AnnotatorBackend = {
	id: "noctalia",
	displayName: "Noctalia (built-in)",
	mode: "manual",

	isAvailable: () => isCommandAvailable("noctalia"),

	command: (imagePath: string) => ["noctalia", "msg", "annotate", imagePath],

	annotate: async (imagePath: string) => {
		await launchDetached("noctalia", ["msg", "annotate", imagePath]);
	},
};
