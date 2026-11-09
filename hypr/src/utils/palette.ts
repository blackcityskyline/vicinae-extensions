// The live border resolves colours when the preset is applied, so the extension
// needs the same thing the desktop already has: one palette, whichever shell
// produced it last. DCH keeps that palette as its canonical artifact and records
// the producer, so it is read first; Dux and skwd are the fallbacks for a session
// where the hub is not running.
export const LIVE_SLUG = "live";
export const FLOW_SLUG = "follow-colors";
export const SWEEP_SLUG = "follow-colors-sweep";
export const PULSE_SLUG = "follow-colors-pulse";
export const TINT_SLUG = "tint";
export const DUOTONE_SLUG = "duotone";
export const COLORBLIND_SLUG = "colorblind";
export const CRT_MOTION_SLUG = "crt-motion";
export const CHROMATIC_MOTION_SLUG = "chromatic-motion";
export const GRAIN_MOTION_SLUG = "grain-motion";

// Roles every palette source carries, so a preference cannot pick a role that
// some theme lacks.
export const PALETTE_ROLES = ["primary", "secondary", "tertiary", "error", "outline"] as const;

export const COLORBLIND_TYPES = ["deutan", "protan", "tritan"] as const;
export type ColorblindType = (typeof COLORBLIND_TYPES)[number];

// Shaders the extension rewrites from preferences or the palette. Any other
// shipped shader is a fixed file and is copied as it is.
export const GENERATED_SHADERS = [TINT_SLUG, DUOTONE_SLUG, COLORBLIND_SLUG] as const;

// These read the `time` uniform. Hyprland zeroes it unless
// `debug:damage_tracking` is 0, so applying one is gated on that option.
export const MOTION_SHADERS = [CRT_MOTION_SLUG, CHROMATIC_MOTION_SLUG, GRAIN_MOTION_SLUG] as const;

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

function channels(hex: string): [number, number, number] | null {
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
	const r = Number.parseInt(full.slice(0, 2), 16);
	const g = Number.parseInt(full.slice(2, 4), 16);
	const b = Number.parseInt(full.slice(4, 6), 16);
	return [r, g, b];
}

function rgb(hex: string): string | null {
	const color = channels(hex);
	return color ? `rgb(${color[0]},${color[1]},${color[2]})` : null;
}

// The shader needs unit floats, not the `rgb()` form Lua takes.
export function tintColor(palette: Palette, role: string): [number, number, number] | null {
	const value = palette.roles[role];
	const color = value ? channels(value) : null;
	return color ? [color[0] / 255, color[1] / 255, color[2] / 255] : null;
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

// First source the caller accepts wins; a file that exists but is half-written
// or empty is skipped rather than painting a border with one colour or tinting
// the screen with a role it does not have.
export function resolvePalette(inputs: PaletteInput[], usable: (palette: Palette) => boolean): Palette | null {
	for (const input of inputs) {
		if (!input.text) continue;
		const palette = input.parse(input.text);
		if (palette && usable(palette)) return palette;
	}
	return null;
}

// Luma-multiplied and mixed back in: bright areas take the role's hue, dark
// areas stay dark, so the tint does not wash out contrast.
export function renderTintShader(tint: [number, number, number]): string {
	const color = tint.map((value) => value.toFixed(3)).join(", ");
	return [
		"// @name Follow Colors Tint",
		"// @tag Tint",
		"// @description Blends a palette role into the screen; choose the role in Preferences.",
		"",
		"#version 300 es",
		"precision highp float;",
		"",
		"in vec2 v_texcoord;",
		"out vec4 fragColor;",
		"uniform sampler2D tex;",
		"",
		`const vec3 TINT = vec3(${color});`,
		"const float AMOUNT = 0.35;",
		"",
		"void main() {",
		"    vec4 color = texture(tex, v_texcoord);",
		"    float luma = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));",
		"    fragColor = vec4(mix(color.rgb, TINT * luma, AMOUNT), color.a);",
		"}",
		"",
	].join("\n");
}

function vec3(color: [number, number, number], digits: number): string {
	const values = color.map((value) => (value === 0 ? "0" : value.toFixed(digits)));
	return `vec3(${values.join(", ")})`;
}

// Viénot, Brettel & Mollon (1999) dichromacy projections, computed from the
// DaltonLens-Python sRGB / Smith-Pokorny 1975 model. Each row maps linear RGB
// onto the colours a dichromat can still tell apart. Tritanopia is rare and the
// model is an approximation there, which DaltonLens itself notes.
export const CVD_MATRICES: Record<ColorblindType, [number, number, number][]> = {
	deutan: [
		[0.29275, 0.70725, 0],
		[0.29275, 0.70725, 0],
		[-0.022337, 0.022337, 1],
	],
	protan: [
		[0.112383, 0.887617, 0],
		[0.112383, 0.887617, 0],
		[0.004006, -0.004006, 1],
	],
	tritan: [
		[1, 0.144612, -0.144612],
		[0, 0.859236, 0.140764],
		[0, 0.859236, 0.140764],
	],
};

// Daltonization in the classic form: simulate the deficiency, take the error
// against the original and push it into the red channel, which a protan or
// deutan still separates. `0.7` is the usual redistribution weight.
export function renderColorblindShader(type: ColorblindType): string {
	const [r, g, b] = CVD_MATRICES[type];
	return [
		"// @name Color Blind Correction",
		"// @tag Accessibility",
		`// @description Daltonizes the screen for ${type} colour vision deficiency; choose the type in Preferences.`,
		"",
		"#version 300 es",
		"precision highp float;",
		"",
		"in vec2 v_texcoord;",
		"out vec4 fragColor;",
		"uniform sampler2D tex;",
		"",
		"// Viénot, Brettel & Mollon (1999): the simulated dichromat response.",
		`const vec3 SIM_R = ${vec3(r!, 6)};`,
		`const vec3 SIM_G = ${vec3(g!, 6)};`,
		`const vec3 SIM_B = ${vec3(b!, 6)};`,
		"",
		"void main() {",
		"    vec4 color = texture(tex, v_texcoord);",
		"    vec3 sim = vec3(dot(color.rgb, SIM_R), dot(color.rgb, SIM_G), dot(color.rgb, SIM_B));",
		"    vec3 err = color.rgb - sim;",
		"    vec3 corrected = color.rgb + vec3(0.7 * (err.g + err.b), 0.0, 0.0);",
		"    fragColor = vec4(clamp(corrected, 0.0, 1.0), color.a);",
		"}",
		"",
	].join("\n");
}

// Shadows are scaled down so black stays black instead of turning the role's
// mid tone into a grey wash.
export function renderDuotoneShader(
	shadow: [number, number, number],
	highlight: [number, number, number],
): string {
	const low = shadow.map((value) => value * 0.25) as [number, number, number];
	return [
		"// @name Duotone",
		"// @tag Palette",
		"// @description Maps the screen onto a shadow and a highlight role; choose both in Preferences.",
		"",
		"#version 300 es",
		"precision highp float;",
		"",
		"in vec2 v_texcoord;",
		"out vec4 fragColor;",
		"uniform sampler2D tex;",
		"",
		`const vec3 SHADOW = ${vec3(low, 3)};`,
		`const vec3 HIGHLIGHT = ${vec3(highlight, 3)};`,
		"",
		"void main() {",
		"    vec4 color = texture(tex, v_texcoord);",
		"    float luma = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));",
		"    fragColor = vec4(mix(SHADOW, HIGHLIGHT, luma), color.a);",
		"}",
		"",
	].join("\n");
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
