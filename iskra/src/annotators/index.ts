import { isCommandAvailable } from "../backends/utils";
import { noctaliaAnswers } from "../lib/noctalia";
import type { AnnotatorBackend } from "./types";

export type { AnnotatorBackend } from "./types";

const onPath = (binary: string) => () => isCommandAvailable(binary);

// Priority order for auto-detection: tools that hand the edited file back come
// first, because only they let the preview reload.
export const ALL_ANNOTATORS: AnnotatorBackend[] = [
	{
		// Satty writes the annotated result back over the file it was given.
		id: "satty",
		displayName: "Satty",
		mode: "auto",
		isAvailable: onPath("satty"),
		command: (file) => [
			"satty",
			"--filename",
			file,
			"--output-filename",
			file,
			"--early-exit",
		],
	},
	{
		id: "swappy",
		displayName: "swappy",
		mode: "auto",
		isAvailable: onPath("swappy"),
		command: (file) => ["swappy", "-f", file, "-o", file],
	},
	{
		// Spectacle's own editor, opened on an existing capture with -E. It is the
		// natural editor on KDE, where Spectacle is already the capture tool.
		id: "spectacle",
		displayName: "Spectacle",
		mode: "manual",
		isAvailable: onPath("spectacle"),
		command: (file) => ["spectacle", "-E", file],
	},
	{
		id: "gimp",
		displayName: "GIMP",
		mode: "manual",
		isAvailable: onPath("gimp"),
		command: (file) => ["gimp", file],
	},
	{
		id: "pinta",
		displayName: "Pinta",
		mode: "manual",
		isAvailable: onPath("pinta"),
		command: (file) => ["pinta", file],
	},
	{
		id: "mspaint",
		displayName: "Paint",
		mode: "manual",
		isAvailable: () => process.platform === "win32",
		command: (file) => ["mspaint.exe", file],
	},
	{
		// Gradia edits the file it is handed and keeps its own save dialog, so the
		// preview cannot be reloaded from the extension side.
		id: "gradia",
		displayName: "Gradia",
		mode: "manual",
		isAvailable: onPath("gradia"),
		command: (file) => ["gradia", file],
	},
	{
		// Noctalia's built-in editor, driven over its own IPC. It never overwrites
		// the source: saving writes a new PNG into Noctalia's screenshot folder, so
		// there is no file for the preview to reload.
		id: "noctalia",
		displayName: "Noctalia (built-in)",
		mode: "manual",
		isAvailable: () => isCommandAvailable("noctalia") && noctaliaAnswers(),
		command: (file) => ["noctalia", "msg", "annotate", file],
	},
];

export const getAnnotator = (id: string): AnnotatorBackend | null =>
	ALL_ANNOTATORS.find((a) => a.id === id) ?? null;
