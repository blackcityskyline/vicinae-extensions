// The live border resolves colours when the preset is applied, so the extension
// needs the same thing the desktop already has: one palette, whichever shell
// produced it last. DCH keeps that palette as its canonical artifact and records
// the producer, so it is read first; Dux and skwd are the fallbacks for a session
// where the hub is not running.
export const LIVE_SLUG = "live";
export const FLOW_SLUG = "follow-colors";
export const SWEEP_SLUG = "follow-colors-sweep";
export const PULSE_SLUG = "follow-colors-pulse";

type Mode = "dark" | "light";

export interface Palette {
	mode: Mode;
	roles: Record<string, string>;
}

export type Parser = (source: string) => Palette | null;

type Json = Record<string, unknown>;

function json(source: string): Json | null {
	let value: unknown;
	try {
		value = JSON.parse(source);
	} catch {
		return null;
	}
	return isRecord(value) ? value : null;
}

function isRecord(value: unknown): value is Json {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function modeOf(value: unknown): Mode {
	return value === "light" ? "light" : "dark";
}

function stringOf(value: unknown): string | null {
	return typeof value === "string" ? value : null;
}

// DCH: canonical `roles.<role>.<mode>`, plus `mode` in the same file.
export function parseDch(source: string): Palette | null {
	const root = json(source);
	const roles = root && isRecord(root.roles) ? root.roles : null;
	if (!roles) return null;
	const mode = modeOf(root?.mode);
	const colors: Record<string, string> = {};
	for (const [role, value] of Object.entries(roles)) {
		const color = stringOf(isRecord(value) ? value[mode] : null);
		if (color) colors[role] = color;
	}
	return { mode, roles: colors };
}

// Dux: `colors.<mode>.<role>`, plus `mode` at the top level.
export function parseDux(source: string): Palette | null {
	const root = json(source);
	const modes = root && isRecord(root.colors) ? root.colors : null;
	if (!modes) return null;
	const mode = modeOf(root?.mode);
	const roles = isRecord(modes[mode]) ? modes[mode] : null;
	if (!roles) return null;
	const colors: Record<string, string> = {};
	for (const [role, value] of Object.entries(roles)) {
		const color = stringOf(value);
		if (color) colors[role] = color;
	}
	return { mode, roles: colors };
}

// skwd's scheme.json: `colors.<role>.<mode>.color`, plus `mode` at the top.
export function parseSkwdScheme(source: string): Palette | null {
	const root = json(source);
	const colors = root && isRecord(root.colors) ? root.colors : null;
	if (!colors) return null;
	const mode = modeOf(root?.mode ?? (root?.is_dark_mode === false ? "light" : undefined));
	const roles: Record<string, string> = {};
	for (const [role, value] of Object.entries(colors)) {
		const entry = isRecord(value) ? value[mode] : null;
		const color = stringOf(isRecord(entry) ? entry.color : null);
		if (color) roles[role] = color;
	}
	return { mode, roles };
}

// skwd-colors.json is the flat expansion and carries no mode key, so it can
// only be read as dark; that is the expansion skwd writes for the current theme.
export function parseSkwdFlat(source: string): Palette | null {
	const root = json(source);
	if (!root) return null;
	const roles: Record<string, string> = {};
	for (const [role, value] of Object.entries(root)) {
		const color = stringOf(value);
		if (color) roles[role] = color;
	}
	return Object.keys(roles).length > 0 ? { mode: "dark", roles } : null;
}

// The roles the border paints, in upstream order. `surface` is deliberately not
// here: in light mode it is the window background, and a border in it vanishes.
const BORDER_ROLES = ["primary", "secondary", "tertiary", "error"] as const;

function rgb(hex: string): string | null {
	const match = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(hex.trim());
	const digits = match?.[1]?.toLowerCase();
	if (!digits) return null;
	const full =
		digits.length === 3
			? digits
					.split("")
					.map((digit) => digit + digit)
					.join("")
			: digits.slice(0, 6);
	const [r, g, b] = [full.slice(0, 2), full.slice(2, 4), full.slice(4, 6)].map((pair) => Number.parseInt(pair, 16));
	return `rgb(${r},${g},${b})`;
}

export function borderColors(palette: Palette): string[] {
	const colors: string[] = [];
	for (const role of BORDER_ROLES) {
		const value = palette.roles[role];
		const color = value ? rgb(value) : null;
		if (color && !colors.includes(color)) colors.push(color);
	}
	return colors;
}

export interface PaletteInput {
	parse: Parser;
	text: string | null;
}

// First source with enough distinct roles wins; a file that exists but is
// half-written or empty is skipped rather than painting a one-colour border.
export function resolvePalette(inputs: PaletteInput[]): Palette | null {
	for (const input of inputs) {
		if (!input.text) continue;
		const palette = input.parse(input.text);
		if (palette && borderColors(palette).length >= 2) return palette;
	}
	return null;
}

export interface BorderStyle {
	name: string;
	tag: string;
	description: string;
	angle: number;
	// Set for a moving border: borderangle runs at this speed around the fixed
	// angle above. Left out, the gradient stays where it is.
	speed?: number;
	// `loop` keeps rotating; `once` sweeps 0→360 when a window gains focus.
	style?: "loop" | "once";
	// Optional custom easing. Sanitised values only: the name and points come
	// from this file, never from the palette.
	curve?: { name: string; points: Array<[number, number]> };
}

export const BORDER_STYLES: Record<string, BorderStyle> = {
	[LIVE_SLUG]: {
		name: "Live Palette",
		tag: "Dynamic",
		description: "Border colours follow the active DCH, Dux or skwd palette.",
		angle: 45,
	},
	[FLOW_SLUG]: {
		name: "Follow Colors Spin",
		tag: "Spin",
		description: "The live palette gradient rotates around the focused window.",
		angle: 45,
		speed: 40,
	},
	[SWEEP_SLUG]: {
		name: "Follow Colors Sweep",
		tag: "Sweep",
		description: "The live palette sweeps once around a window when it gains focus.",
		angle: 45,
		speed: 10,
		style: "once",
	},
	[PULSE_SLUG]: {
		name: "Follow Colors Pulse",
		tag: "Pulse",
		description: "The live palette turns in a heartbeat rhythm, then rests.",
		angle: 45,
		speed: 40,
		curve: { name: "follow_pulse", points: [[0.05, 0.9], [0.1, 1]] },
	},
};

export function renderBorder(colors: string[], style: BorderStyle): string {
	const lines = [
		`-- @name ${style.name}`,
		`-- @tag ${style.tag}`,
		`-- @description ${style.description}`,
		"",
	];
	if (style.curve) {
		const points = style.curve.points.map(([x, y]) => `{ ${x}, ${y} }`).join(", ");
		lines.push(`hl.curve("${style.curve.name}", { type = "bezier", points = { ${points} } });`, "");
	}
	lines.push(
		"hl.config({",
		"\tgeneral = {",
		"\t\tborder_size = 2,",
		"\t\tcol = {",
		`\t\t\tactive_border = { colors = { ${colors.map((color) => JSON.stringify(color)).join(", ")} }, angle = ${style.angle} },`,
		'\t\t\tinactive_border = "rgb(0,0,0)",',
		"\t\t},",
		"\t},",
		"});",
		"",
	);
	lines.push(
		style.speed === undefined
			? 'hl.animation({ leaf = "borderangle", enabled = false });'
			: `hl.animation({ leaf = "borderangle", enabled = true, speed = ${style.speed}, bezier = "${style.curve?.name ?? "linear"}", style = "${style.style ?? "loop"}" });`,
	);
	return lines.join("\n");
}
