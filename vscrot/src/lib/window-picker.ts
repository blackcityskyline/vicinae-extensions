import { runSelector } from "../backends/utils";
import { listWindows } from "./hypr-windows";

/**
 * The on-screen window picker: `slurp -r` outlines the windows that the capture
 * can actually contain and the user clicks one. The launcher is already closed,
 * so the outline sits over the desktop, not over Vicinae.
 *
 * Window boxes come from Hyprland when it is the compositor. Anywhere else the
 * list is empty and slurp falls back to a free selection, which every wlroots
 * compositor supports: a picker that only exists on one computer is worse than
 * a plain region.
 */
export const selectWindowGeometry = (): string => {
	const boxes = listWindows()
		.map((window) => window.geometry)
		.join("\n");
	if (boxes.length === 0) return runSelector("slurp", []);
	return runSelector("slurp", ["-r"], `${boxes}\n`);
};
