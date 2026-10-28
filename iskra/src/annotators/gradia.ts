import type { AnnotatorBackend } from "./types";
import { isCommandAvailable, launchDetached } from "../backends/utils";

// Gradia edits the file it is handed and keeps its own save dialog, so the
// preview cannot be reloaded from the extension side.
export const gradiaAnnotator: AnnotatorBackend = {
	id: "gradia",
	displayName: "Gradia",
	mode: "manual",

	isAvailable: () => isCommandAvailable("gradia"),

	command: (imagePath: string) => ["gradia", imagePath],

	annotate: async (imagePath: string) => {
		await launchDetached("gradia", [imagePath]);
	},
};
