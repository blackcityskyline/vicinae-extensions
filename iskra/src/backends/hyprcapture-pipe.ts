import { writeFileSync } from "node:fs";
import type { CaptureBackend, CaptureMode } from "./types";
import { isCommandAvailable, run, runSelector } from "./utils";
import {
	capturePipe,
	composeFrames,
	cropImage,
	encodePng,
	parseGeometry,
	type Image,
	type PipeMonitor,
} from "../lib/hyprcapture-pipe";
import { selectWindowGeometry } from "../lib/window-picker";
import { pluginListHasHyprcapture } from "./hyprcapture";

/**
 * The same plugin without its overlay: one fullscreen/all-monitors RGBA frame
 * over the export pipe, cropped here. This is the path that can feed the
 * annotation, OCR and QR steps because it produces a file.
 */

let available: boolean | null = null;

export const hyprcapturePipeAvailable = (): boolean => {
	if (available === null) {
		available = false;
		if (!process.env.HYPRLAND_INSTANCE_SIGNATURE) return available;
		try {
			available = pluginListHasHyprcapture(run("hyprctl", ["plugin", "list"]));
		} catch {
			available = false;
		}
	}
	return available;
};

export const resetHyprcapturePipeAvailability = (): void => {
	available = null;
};

const monitorRect = (monitor: PipeMonitor): string => {
	const { x, y, width, height } = monitor.geometry;
	return `${Math.round(x)},${Math.round(y)} ${Math.round(width)}x${Math.round(height)}`;
};

const writeImage = (
	image: Image,
	topDown: boolean,
	outputPath: string,
): void => {
	writeFileSync(outputPath, encodePng(image.width, image.height, image.rgba, topDown));
};

const captureCropped = async (
	rect: string,
	outputPath: string,
): Promise<void> => {
	// Parse first: a bad region must fail before a screenshot is taken.
	const geometry = parseGeometry(rect);
	const response = await capturePipe();
	const image = cropImage(composeFrames(response), geometry);
	writeImage(image, response.header.topDown, outputPath);
};

export const hyprcapturePipeBackend: CaptureBackend = {
	id: "hyprcapture-pipe",
	displayName: "HyprCapture (pipe)",
	sessions: ["wayland"],
	wlrootsOnly: true,
	// Region and window selection still go through slurp; monitor and full do not.
	get supportedModes(): CaptureMode[] {
		return isCommandAvailable("slurp")
			? ["area", "window", "monitor", "full"]
			: ["monitor", "full"];
	},
	targetsNamedOutput: true,

	isAvailable: hyprcapturePipeAvailable,

	captureRegion: captureCropped,

	capture: async (mode, outputPath, outputName) => {
		if (mode === "area") {
			await captureCropped(runSelector("slurp", []), outputPath);
			return;
		}
		if (mode === "window") {
			await captureCropped(selectWindowGeometry(), outputPath);
			return;
		}

		const response = await capturePipe();
		const image = composeFrames(response);
		if (mode === "monitor") {
			const monitor =
				response.header.monitors.find((candidate) => candidate.name === outputName) ??
				response.header.monitors[0];
			if (!monitor) throw new Error("HyprCapture reported no monitors");
			writeImage(cropImage(image, parseGeometry(monitorRect(monitor))), response.header.topDown, outputPath);
			return;
		}
		writeImage(image, response.header.topDown, outputPath);
	},
};
