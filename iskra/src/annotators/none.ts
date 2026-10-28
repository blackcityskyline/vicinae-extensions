import type { AnnotatorBackend } from "./types";

export const noneAnnotator: AnnotatorBackend = {
	id: "none",
	displayName: "None",
	mode: "manual",

	isAvailable: () => true,

	command: () => [],

	annotate: async (_imagePath: string) => {},
};
