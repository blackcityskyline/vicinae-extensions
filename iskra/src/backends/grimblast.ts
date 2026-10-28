import { grimBackend } from "./grim";
import type { CaptureBackend } from "./types";
import { isCommandAvailable, run } from "./utils";

// grimblast differs from grim only for the two modes it can run on its own.
// `grimblast save output|active` capture whichever output or window has focus
// once Vicinae closes, which races with closeMainWindow() shifting focus, so
// monitor and window capture go through grim with an explicit target.
export const grimblastBackend: CaptureBackend = {
	...grimBackend,
	id: "grimblast",
	displayName: "grimblast (Hyprland)",

	isAvailable: () => isCommandAvailable("grimblast"),

	capture: async (mode, outputPath, outputName, options) => {
		if (mode === "area" || mode === "full") {
			run("grimblast", [
				"save",
				mode === "area" ? "area" : "screen",
				outputPath,
			]);
		} else {
			await grimBackend.capture(mode, outputPath, outputName, options);
		}
	},
};
