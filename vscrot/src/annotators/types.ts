export type AnnotationMode = "auto" | "manual";

export interface AnnotatorBackend {
	readonly id: string;
	readonly displayName: string;
	/** "auto" = blocks until editor closes and writes output; "manual" = opens editor non-blocking */
	readonly mode: AnnotationMode;
	isAvailable(): boolean;
	/**
	 * argv that opens the tool on an image. `annotate` runs it inside the
	 * extension; this exists for callers that must run it on their own, such as
	 * the notification action that outlives the command.
	 */
	command(imagePath: string): string[];
	annotate(imagePath: string): Promise<void>;
}
