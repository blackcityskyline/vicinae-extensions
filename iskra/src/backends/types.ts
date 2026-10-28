export type CaptureMode = "area" | "window" | "monitor" | "full";

export type Session = "wayland" | "x11" | "darwin" | "win32";

export type CaptureOptions = {
	/**
	 * Whether the capture tool may show its own notification. Suppressed when
	 * Vicinae owns the preview, because that notification would point at a
	 * temporary file the extension deletes.
	 */
	notify?: boolean;
};

export interface CaptureBackend {
	readonly id: string;
	readonly displayName: string;
	readonly supportedModes: CaptureMode[];
	/**
	 * Display environments this tool can drive. Being on PATH is not enough: an
	 * installed Wayland tool cannot capture an X11 session and vice versa.
	 */
	readonly sessions: readonly Session[];
	/**
	 * Wayland is not one capture environment. grim and grimblast speak the
	 * wlroots-only `wlr-screencopy` protocol, which KWin and Mutter do not
	 * implement: on KDE or GNOME they fail with "compositor doesn't support the
	 * screen capture protocol" even though the binary is installed and the
	 * session is Wayland. A backend flagged here is only eligible on a wlroots
	 * compositor.
	 */
	readonly wlrootsOnly?: boolean;
	isAvailable(): boolean;
	/**
	 * Whether "monitor" capture can be pointed at a specific output. Spectacle
	 * and similar tools only capture the monitor the cursor is on, so offering a
	 * picker for them would promise a choice the tool cannot honour.
	 */
	readonly targetsNamedOutput?: boolean;
	/**
	 * Displays this backend can target, when it can enumerate them itself.
	 * The returned `id` is what the monitor command passes back as `outputName`.
	 */
	listDisplays?(): Promise<{ id: string; name: string }[]>;
	/**
	 * Captures an explicit `x,y wxh` region. Present only for tools that take a
	 * geometry; its absence is what tells the window picker to fall back to the
	 * tool's own selector.
	 */
	captureRegion?(geometry: string, outputPath: string): Promise<void>;
	capture(
		mode: CaptureMode,
		outputPath: string,
		outputName?: string,
		options?: CaptureOptions,
	): Promise<void>;
}
