import type { AnnotatorBackend } from "./types";
import { isCommandAvailable, run } from "../backends/utils";

// Satty writes the annotated result back over the file it was given, which is
// why it can reload the preview once it exits.
const args = (imagePath: string): string[] => [
	"--filename",
	imagePath,
	"--output-filename",
	imagePath,
	"--early-exit",
];

export const sattyAnnotator: AnnotatorBackend = {
	id: "satty",
	displayName: "Satty",
	mode: "auto",

	isAvailable: () => isCommandAvailable("satty"),

	command: (imagePath: string) => ["satty", ...args(imagePath)],

	annotate: async (imagePath: string) => {
		run("satty", args(imagePath));
	},
};
