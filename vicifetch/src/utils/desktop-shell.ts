export type Process = { pid: number; ppid: number; comm: string };

/** A shell runtime that renders for another name: `dms` runs as `qs` underneath. */
const RUNTIMES = new Set(["qs", "quickshell"]);

/**
 * Panels and shells that draw the desktop, used only when the compositor cannot
 * be asked. Most specific first.
 */
const KNOWN: [process: string, name: string][] = [
	["dms", "dms"],
	["dankmaterialshell", "dankmaterialshell"],
	["noctalia-shell", "noctalia-shell"],
	["caelestia-shell", "caelestia-shell"],
	["hyprpanel", "hyprpanel"],
	["gnome-shell", "GNOME Shell"],
	["plasmashell", "Plasma"],
	["cosmic-session", "COSMIC"],
	["cinnamon", "Cinnamon"],
	["xfce4-panel", "xfce4-panel"],
	["mate-panel", "mate-panel"],
	["lxqt-panel", "lxqt-panel"],
	["quickshell", "quickshell"],
	["qs", "quickshell"],
	["ags", "ags"],
	["eww", "eww"],
	["waybar", "waybar"],
];

const record = (value: unknown): Record<string, unknown> | undefined =>
	typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;

/**
 * `hyprctl layers -j` is `{ "<monitor>": { levels: { "<level>": [{ pid, … }] } } }`.
 * The desktop shell is the process that paints most of the screen: bars, panels,
 * docks and their tooltips all belong to it.
 */
export function layerOwner(layers: unknown): number | undefined {
	const counts = new Map<number, number>();

	for (const monitor of Object.values(record(layers) ?? {})) {
		const levels = record(record(monitor)?.levels);
		for (const surfaces of Object.values(levels ?? {})) {
			if (!Array.isArray(surfaces)) continue;
			for (const surface of surfaces) {
				const pid = record(surface)?.pid;
				if (typeof pid === "number") counts.set(pid, (counts.get(pid) ?? 0) + 1);
			}
		}
	}

	let owner: number | undefined;
	for (const [pid, count] of counts) {
		if (owner === undefined || count > (counts.get(owner) ?? 0)) owner = pid;
	}
	return owner;
}

/** The name of the layer owner, climbing out of a generic shell runtime. */
export function shellName(processes: readonly Process[], pid: number): string | undefined {
	const byPid = new Map(processes.map((entry) => [entry.pid, entry]));
	let current = byPid.get(pid);

	for (let step = 0; current && RUNTIMES.has(current.comm) && step < 8; step += 1) {
		current = byPid.get(current.ppid);
	}

	return current?.comm;
}

/** The last resort: a known shell process, no compositor needed. */
export function knownShell(processes: readonly { comm: string }[]): string | undefined {
	const running = new Set(processes.map((process) => process.comm));
	return KNOWN.find(([process]) => running.has(process))?.[1];
}
