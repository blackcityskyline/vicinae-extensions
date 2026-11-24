/**
 * Everything about hyprimate that can be decided without touching Hyprland:
 * reading `hyprctl getoption` output, turning user input into a value the
 * plugin accepts, and emitting the Lua that `hyprctl eval` runs. The panels and
 * the tests share these, so the exact expression that reaches the compositor
 * is asserted.
 */

import { HYPRIMATE_OPTIONS, type HyprimateOption, type HyprimateScope } from "./hyprimate-catalog.ts";

export const PLUGIN_PREFIX = "plugin:hyprimate:";

/** Table the settings live in, for `hl.config`. */
const PLUGIN_TABLE = ["plugin", "hyprimate"] as const;

export type AnimationScope = Exclude<HyprimateScope, "global" | "workspace">;

export interface StyleInfo {
	slug: string;
	name: string;
	tagline: string;
}

/** `window.style`, in the plugin's own order. */
export const WINDOW_STYLES: StyleInfo[] = [
	{ slug: "liquid", name: "Liquid", tagline: "Windows flow and stretch." },
	{ slug: "paper", name: "Paper", tagline: "Windows crumple and unfold like a sheet." },
	{ slug: "cloth", name: "Cloth", tagline: "Windows drape and fold like a curtain." },
	{ slug: "swarm", name: "Swarm", tagline: "Creatures carry pieces of the window." },
	{ slug: "bubble", name: "Bubble", tagline: "A soap film inflates, moves and bursts." },
	{ slug: "smoke", name: "Smoke", tagline: "Windows unravel into flowing smoke." },
	{ slug: "burn", name: "Burn", tagline: "The sheet burns, the wallpaper scars." },
	{ slug: "construction", name: "Construction", tagline: "Builders raise and fasten the panels." },
];

/** `workspace.style`. */
export const WORKSPACE_STYLES: StyleInfo[] = [
	{ slug: "rotation", name: "Rotation", tagline: "A wheel of workspaces turns." },
	{ slug: "planet_hop", name: "Planet Hop", tagline: "Workspaces become planets to fly between." },
	{ slug: "cube", name: "Cube", tagline: "Turn between workspaces on a cube." },
	{ slug: "lava", name: "Lava", tagline: "The workspace melts and cools as lava." },
];

export const SCOPE_ORDER: AnimationScope[] = ["shared", "open", "close", "movement"];

export const SCOPE_LABEL: Record<AnimationScope, string> = {
	shared: "Every animation",
	open: "Opening",
	close: "Closing",
	movement: "Movement",
};

/** One-line meaning of a scope, shown under the picker. */
export const SCOPE_HINT: Record<AnimationScope, string> = {
	shared: "Default for movement, opening and closing; per-animation values win.",
	open: "Opening only; wins over the shared value while the window appears.",
	close: "Closing only; wins over the shared value while the window leaves.",
	movement: "Moving, resizing and workspace slides.",
};

export function styleInfo(slug: string): StyleInfo | undefined {
	return WINDOW_STYLES.find((style) => style.slug === slug) ?? WORKSPACE_STYLES.find((style) => style.slug === slug);
}

export function optionKey(option: HyprimateOption): string {
	return PLUGIN_PREFIX + option.key;
}

/** Options of one animation scope for one window style, in catalog order. */
export function optionsFor(style: string, scope: AnimationScope): HyprimateOption[] {
	return HYPRIMATE_OPTIONS.filter((option) => option.style === style && option.scope === scope);
}

/** Options of a workspace style. */
export function workspaceOptionsFor(style: string): HyprimateOption[] {
	return HYPRIMATE_OPTIONS.filter((option) => option.style === style && option.scope === "workspace");
}

/** Global switches and effect settings: everything without a style. */
export function globalOptions(): HyprimateOption[] {
	return HYPRIMATE_OPTIONS.filter((option) => option.scope === "global");
}

/** Globals a person tunes here; the two styles have their own list. */
export function tunableGlobals(): HyprimateOption[] {
	return globalOptions().filter((option) => option.path !== "window.style" && option.path !== "workspace.style");
}

export function globalOption(path: string): HyprimateOption {
	const found = HYPRIMATE_OPTIONS.find((option) => option.scope === "global" && option.path === path);
	if (!found) throw new Error(`hyprimate has no setting ${path}`);
	return found;
}

/** The shared twin of a per-animation option, when the style has one. */
export function sharedSibling(option: HyprimateOption): HyprimateOption | undefined {
	if (option.scope !== "open" && option.scope !== "close" && option.scope !== "movement") return undefined;
	const marker = `.options.${option.style ?? ""}`;
	const tail = option.path.slice(option.path.indexOf(marker));
	return HYPRIMATE_OPTIONS.find(
		(candidate) => candidate.scope === "shared" && candidate.style === option.style && candidate.path.endsWith(tail),
	);
}

/** What `hyprctl getoption` says: the live value and whether config set it. */
export interface OptionState {
	value: string | number | boolean;
	set: boolean;
}

/**
 * Reads `hyprctl getoption` text output. It is not JSON: the first line is
 * `<type>: <value>`, the second is `set: true|false`. `no such option` (plugin
 * not loaded) yields null.
 */
export function parseOptionOutput(text: string): OptionState | null {
	const head = text.split("\n")[0]?.trim() ?? "";
	const match = /^(?<kind>[a-z][a-z ]*):\s?(?<raw>.*)$/u.exec(head);
	if (!match?.groups) return null;
	const kind = match.groups.kind ?? "";
	const raw = (match.groups.raw ?? "").trim();
	let value: string | number | boolean = raw;
	if (kind === "float" || kind === "int") {
		const parsed = Number(raw);
		if (!Number.isFinite(parsed)) return null;
		value = parsed;
	} else if (kind === "bool") {
		value = raw === "true";
	}
	return { value, set: /set:\s*true/u.test(text) };
}

export interface ParsedInput {
	ok: boolean;
	value?: string | number | boolean;
	error?: string;
}

/** Ranges and choices in one line, for form info and for rejecting a value out loud. */
export function rangeText(option: HyprimateOption): string {
	if (option.choices) return option.choices.join(" · ");
	const { min, max } = option;
	if (min !== undefined && max !== undefined) return `${trimNumber(min)} – ${trimNumber(max)}`;
	if (min !== undefined) return `≥ ${trimNumber(min)}`;
	if (max !== undefined) return `≤ ${trimNumber(max)}`;
	return "";
}

/** Milliseconds and seconds read best with a unit; the plugin measures in these. */
export function unitOf(option: HyprimateOption): string {
	const inSeconds = /scorch_lifetime|healing_duration/u.test(option.path);
	if (inSeconds) return "s";
	if (option.path.endsWith("_duration")) return "ms";
	if (/wind_direction/u.test(option.path)) return "°";
	if (/gravity_strength|wind_strength/u.test(option.path)) return "px/s";
	if (option.path.endsWith("_length")) return "px";
	return "";
}

export function trimNumber(value: number): string {
	if (!Number.isFinite(value)) return String(value);
	const rounded = Math.round(value * 1000) / 1000;
	return String(rounded);
}

function formatHex(value: number): string {
	return `0x${(value >>> 0).toString(16).toUpperCase().padStart(8, "0")}`;
}

/** Parses `#aarrggbb`, `0xaarrggbb`, `aarrggbb` or `rrggbb` into ARGB. */
export function parseColor(raw: string): number | null {
	const cleaned = raw.trim().replace(/^#/u, "").replace(/^0x/iu, "");
	if (!/^[0-9a-f]{6}(?:[0-9a-f]{2})?$/iu.test(cleaned)) return null;
	const hex = cleaned.length === 6 ? `ff${cleaned}` : cleaned;
	return Number.parseInt(hex, 16) >>> 0;
}

function fail(error: string): ParsedInput {
	return { ok: false, error };
}

/** Turns what the user typed into a value the plugin will accept, or says why not. */
export function parseInput(option: HyprimateOption, raw: string): ParsedInput {
	const trimmed = raw.trim();
	if (option.type === "boolean") {
		if (trimmed !== "true" && trimmed !== "false") return fail("Enter true or false");
		return { ok: true, value: trimmed === "true" };
	}
	if (option.type === "color") {
		const color = parseColor(trimmed);
		if (color === null) return fail("Enter #aarrggbb or #rrggbb");
		return { ok: true, value: color };
	}
	if (option.type === "float" || option.type === "int") {
		if (!trimmed) return fail("Enter a number");
		const parsed = Number(trimmed);
		if (!Number.isFinite(parsed)) return fail(`"${trimmed}" is not a number`);
		const value = option.type === "int" ? Math.round(parsed) : parsed;
		if (option.min !== undefined && value < option.min) return fail(`Smallest value is ${trimNumber(option.min)}`);
		if (option.max !== undefined && value > option.max) return fail(`Largest value is ${trimNumber(option.max)}`);
		return { ok: true, value };
	}
	if (!trimmed) return fail("Enter a value");
	if (option.type === "set") {
		const tokens = trimmed.split(",").map((token) => token.trim());
		const allowed = option.choices ?? [];
		const wrong = tokens.find((token) => allowed.length > 0 && !allowed.includes(token));
		if (wrong) return fail(`${wrong} is not one of ${allowed.join(", ")}`);
		return { ok: true, value: tokens.join(",") };
	}
	if (option.choices && !option.choices.includes(trimmed)) return fail(`Pick one of ${option.choices.join(", ")}`);
	return { ok: true, value: trimmed };
}

/** The plugin's own default, ready to send back. */
export function defaultValue(option: HyprimateOption): string | number | boolean {
	if (option.type === "color") return parseColor(String(option.default)) ?? 0;
	return option.default;
}

/** How much one press adds or subtracts. */
export function stepOf(option: HyprimateOption): number {
	if (option.type !== "float" && option.type !== "int") return 0;
	if (option.type === "int") return 1;
	const min = option.min ?? 0;
	const max = option.max ?? Math.max(Number(option.default) || 1, min + 1);
	const span = Math.abs(max - min);
	if (span >= 1000) return 50;
	if (span >= 100) return 10;
	if (span >= 10) return 1;
	if (span >= 2) return 0.1;
	return 0.05;
}

/** Keeps a typed or nudged value inside the plugin's range. */
export function clampValue(option: HyprimateOption, value: number): number {
	const min = option.min ?? -Number.MAX_VALUE;
	const max = option.max ?? Number.MAX_VALUE;
	const clamped = Math.min(max, Math.max(min, value));
	const rounded = Math.round(clamped * 1000) / 1000;
	return option.type === "int" ? Math.round(rounded) : rounded;
}

/** Live value as the user should see it. */
export function displayValue(option: HyprimateOption, value: string | number | boolean): string {
	if (option.type === "color" && typeof value === "number") return formatHex(value);
	if (typeof value === "number") return trimNumber(value);
	if (typeof value === "boolean") return value ? "on" : "off";
	return value;
}

/** Value as a Lua literal inside `hl.config`. */
export function luaValue(option: HyprimateOption, value: string | number | boolean): string {
	if (typeof value === "boolean") return value ? "true" : "false";
	if (typeof value === "number") {
		if (option.type === "color") return formatHex(value);
		return option.type === "int" ? String(Math.round(value)) : trimNumber(value);
	}
	return JSON.stringify(value);
}

export interface Assignment {
	option: HyprimateOption;
	value: string | number | boolean;
}

type LuaNode = { text: string } | { children: Record<string, LuaNode> };

function normalizeLuaKey(key: string): string {
	return /^[A-Za-z_][A-Za-z0-9_]*$/u.test(key) ? key : `[${JSON.stringify(key)}]`;
}

function renderLua(node: LuaNode, depth: number): string {
	if ("text" in node) return node.text;
	const pad = "\t".repeat(depth + 1);
	const entries = Object.keys(node.children)
		.sort()
		.map((key) => `${pad}${normalizeLuaKey(key)} = ${renderLua(node.children[key] as LuaNode, depth + 1)}`);
	return `{\n${entries.join(",\n")},\n${"\t".repeat(depth)}}`;
}

/** A Lua table body for the given settings, keys sorted so writes are stable. */
export function luaTable(assignments: readonly Assignment[]): string {
	const root: Record<string, LuaNode> = {};
	for (const { option, value } of assignments) {
		const segments = [...PLUGIN_TABLE, ...option.path.split(".")];
		const leaf = segments[segments.length - 1] as string;
		let level = root;
		for (const segment of segments.slice(0, -1)) {
			const existing = level[segment];
			if (!existing) {
				const created: { children: Record<string, LuaNode> } = { children: {} };
				level[segment] = created;
				level = created.children;
			} else if ("children" in existing) {
				level = existing.children;
			} else {
				throw new Error(`hyprimate setting ${option.path} conflicts with ${segments.join(".")}`);
			}
		}
		level[leaf] = { text: luaValue(option, value) };
	}
	return renderLua({ children: root }, 0);
}

/** The expression `hyprctl eval` runs: one call for a whole batch of settings. */
export function configExpression(assignments: readonly Assignment[]): string {
	return `hl.config(${luaTable(assignments)})`;
}

export const MANAGED_START = "-- >>> hyprimate settings, written by the Hypr extension";
export const MANAGED_END = "-- <<< hyprimate settings";

/** The block that goes into the user's plugin file. */
export function managedBlock(assignments: readonly Assignment[]): string {
	return [
		MANAGED_START,
		"-- Everything between these lines is regenerated by the extension's Save to Config.",
		configExpression(assignments),
		MANAGED_END,
		"",
	].join("\n");
}

/**
 * Puts the block at the end of the file, replacing the previous block if there
 * is one. Later config wins, so the managed block must stay below the rest.
 */
export function mergeManagedBlock(existing: string, block: string): string {
	const start = existing.indexOf(MANAGED_START);
	const end = existing.indexOf(MANAGED_END);
	if (start >= 0 && end > start) {
		const before = existing.slice(0, start).replace(/\n+$/u, "\n");
		const after = existing.slice(end + MANAGED_END.length).replace(/^\n/u, "");
		return `${before}${block}${after}`;
	}
	const head = existing.trimEnd();
	return head ? `${head}\n\n${block}` : block;
}
