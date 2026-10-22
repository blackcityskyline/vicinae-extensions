import type { AnnotatorBackend } from "./types";
import { isCommandAvailable, run } from "../backends/utils";

const args = (imagePath: string): string[] => ["-f", imagePath, "-o", imagePath];

export const swappyAnnotator: AnnotatorBackend = {
	id: "swappy",
	displayName: "swappy",
	mode: "auto",

	isAvailable: () => isCommandAvailable("swappy"),

	command: (imagePath: string) => ["swappy", ...args(imagePath)],

	annotate: async (imagePath: string) => {
		run("swappy", args(imagePath));
	},
};
