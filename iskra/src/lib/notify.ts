import { spawn } from "node:child_process";
import type { AnnotatorBackend } from "../annotators/types";

// `notify-send` only reports which action was clicked when it is told to wait,
// so the action has to be handled by whoever is waiting. That is this shell,
// spawned detached: the notification outlives the Vicinae command that took the
// screenshot, and the annotator runs from the click rather than from the view.
//
// The image path and the annotator argv travel as positional parameters. The
// script interpolates nothing into itself, so a path with spaces, quotes or
// `$(...)` is data for notify-send and for the annotator, not shell syntax.
const SCRIPT = [
	'command -v notify-send >/dev/null 2>&1 || exit 0',
	'action=$(notify-send --wait --app-name="VScrot+" -A annotate=Annotate -i "$1" "$2" "$1")',
	'[ "$action" = annotate ] || exit 0',
	"shift 2",
	'exec "$@"',
].join("\n");

/** Shows the capture with an Annotate button; the click opens `annotator` on it. */
export const notifyAnnotation = (
	imagePath: string,
	annotator: AnnotatorBackend,
): void => {
	const command = annotator.command(imagePath);
	if (command.length === 0) return;

	const child = spawn(
		"/bin/sh",
		["-c", SCRIPT, "sh", imagePath, "Iskra saved", ...command],
		{ detached: true, stdio: "ignore" },
	);
	child.unref();
};
