export interface AnnotatorBackend {
	readonly id: string;
	readonly displayName: string;
	/**
	 * "auto": the tool rewrites the file it was given and blocks until the
	 * editor closes, so the preview can reload. "manual": the tool is only
	 * launched, and saving is left to the user.
	 */
	readonly mode: "auto" | "manual";
	isAvailable(): boolean;
	/** argv that opens the tool on an image. Nothing here passes through a shell. */
	command(imagePath: string): [string, ...string[]];
}
