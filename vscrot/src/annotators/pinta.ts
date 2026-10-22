import type { AnnotatorBackend } from "./types";
import { isCommandAvailable, launchDetached } from "../backends/utils";

export const pintaAnnotator: AnnotatorBackend = {
	id: "pinta",
	displayName: "Pinta",
	mode: "manual",

	isAvailable: () => isCommandAvailable("pinta"),

	command: (imagePath: string) => ["pinta", imagePath],

	annotate: async (imagePath: string) => {
		await launchDetached("pinta", [imagePath]);
	},
};
