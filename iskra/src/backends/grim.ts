import type { CaptureBackend, CaptureMode } from "./types";
import { selectWindowGeometry } from "../lib/window-picker";
import {
	isCommandAvailable,
	run,
	runSelector,
	selectMonitor,
} from "./utils";

export const grimBackend: CaptureBackend = {
	id: "grim",
	displayName: "grim + slurp (Wayland)",
	supportedModes: ["area", "window", "monitor", "full"],
	sessions: ["wayland"],
	wlrootsOnly: true,
	targetsNamedOutput: true,

	isAvailable: () => isCommandAvailable("grim") && isCommandAvailable("slurp"),

	captureRegion: async (geometry: string, outputPath: string) => {
		run("grim", ["-g", geometry, outputPath]);
	},

	capture: async (
		mode: CaptureMode,
		outputPath: string,
		outputName?: string,
	) => {
		if (mode === "monitor") {
			run("grim", ["-o", outputName ?? selectMonitor(), outputPath]);
			return;
		}
		if (mode === "full") {
			run("grim", [outputPath]);
			return;
		}
		const geometry =
			mode === "area" ? runSelector("slurp", []) : selectWindowGeometry();
		run("grim", ["-g", geometry, outputPath]);
	},
};
