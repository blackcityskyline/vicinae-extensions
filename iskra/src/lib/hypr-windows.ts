import { run } from "../backends/utils";

export interface WindowTarget {
	address: string;
	title: string;
	className: string;
	workspace: number;
	/** slurp/grim geometry: `x,y wxh` in global layout coordinates. */
	geometry: string;
}

type RawWindow = {
	address: string;
	mapped: boolean;
	hidden: boolean;
	pinned: boolean;
	at: [number, number];
	size: [number, number];
	workspace: { id: number } | null;
	class: string;
	title: string;
};

/**
 * Windows that the next capture can actually contain.
 *
 * A crop of the screen only shows what is on screen: a window on a hidden
 * workspace has coordinates, but the pixels at those coordinates belong to the
 * workspace that is visible. Pinned windows are included because they are
 * visible everywhere. `at`/`size` come from Hyprland's own goal geometry
 * (HyprCtl.cpp:426), which is already global — monitor offsets included — so no
 * per-monitor arithmetic belongs here.
 */
export const parseWindows = (
	clientsJson: string,
	activeWorkspaceId: number,
): WindowTarget[] =>
	(JSON.parse(clientsJson) as RawWindow[])
		.filter(
			(window) =>
				window.mapped &&
				!window.hidden &&
				(window.pinned || window.workspace?.id === activeWorkspaceId),
		)
		.map((window) => ({
			address: window.address,
			title: window.title || window.class || window.address,
			className: window.class,
			workspace: window.workspace?.id ?? -1,
			geometry: `${window.at[0]},${window.at[1]} ${window.size[0]}x${window.size[1]}`,
		}))
		.sort((a, b) => a.title.localeCompare(b.title));

/** Empty when Hyprland is not the compositor, or cannot be asked right now. */
export const listWindows = (): WindowTarget[] => {
	try {
		const workspace = JSON.parse(run("hyprctl", ["activeworkspace", "-j"])) as {
			id: number;
		};
		return parseWindows(run("hyprctl", ["clients", "-j"]), workspace.id);
	} catch {
		return [];
	}
};
