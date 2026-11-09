import { execFile } from "node:child_process";
import { access, copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { environment, getPreferenceValues } from "@vicinae/api";

import { liveBorder } from "~/api/palette.ts";
import {
	composeActive,
	formatState,
	mergePresets,
	parseState,
	toPreset,
	type AnimState,
	type Preset,
	type PresetKind,
} from "~/utils/preset.ts";
import { BORDER_STYLES } from "~/utils/palette.ts";

export const HYPR_DIR = join(homedir(), ".config", "hypr");
export const ANIM_DIR = join(HYPR_DIR, "animations");
export const ACTIVE_FILE = join(ANIM_DIR, "active.lua");
export const SHADER_FILE = join(ANIM_DIR, "shader.frag");
export const STATE_FILE = join(HYPR_DIR, ".anim_state");
export const HYPRLAND_FILE = join(HYPR_DIR, "hyprland.lua");

const SHIPPED: Record<PresetKind, string> = {
	animation: "presets",
	border: "borders",
	shader: "shaders",
};

// Personal presets live next to active.lua, one subdirectory per kind so a
// border never shows up in the animation list.
const PERSONAL: Record<PresetKind, string> = {
	animation: ANIM_DIR,
	border: join(ANIM_DIR, "borders"),
	shader: join(ANIM_DIR, "shaders"),
};

const EXTENSION: Record<PresetKind, string> = {
	animation: ".lua",
	border: ".lua",
	shader: ".frag",
};

// The dropdown only offers 1-4, so this clamp guards a hand-edited preferences
// file, not the UI. A preset with a 0 px border would apply and change nothing.
const { borderSize } = getPreferenceValues<{ borderSize?: string }>();
const BORDER_SIZE = Math.min(4, Math.max(1, Number.parseInt(borderSize ?? "2", 10) || 2));

export type CommandResult = { ok: true; stdout: string } | { ok: false; error: string };

function run(command: string, args: string[], timeoutMs = 10_000): Promise<CommandResult> {
	return new Promise((resolve) => {
		execFile(command, args, { timeout: timeoutMs, encoding: "utf8" }, (error, stdout, stderr) => {
			if (!error) {
				resolve({ ok: true, stdout });
				return;
			}
			const missing = (error as NodeJS.ErrnoException).code === "ENOENT";
			resolve({
				ok: false,
				error: missing ? `${command} is not installed` : (stderr || error.message).trim(),
			});
		});
	});
}

function slugOf(file: string, kind: PresetKind): string {
	return file.slice(0, -EXTENSION[kind].length);
}

async function loadDir(dir: string, kind: PresetKind, origin: Preset["origin"]): Promise<Preset[]> {
	const files = (await readdir(dir).catch(() => []))
		.filter((file) => file.endsWith(EXTENSION[kind]))
		// active.lua is generated; it is not a preset.
		.filter((file) => dir !== ANIM_DIR || file !== "active.lua")
		.sort();
	return Promise.all(
		files.map(async (file) => toPreset(slugOf(file, kind), await readFile(join(dir, file), "utf8"), origin, kind)),
	);
}

export async function loadShippedPresets(kind: PresetKind): Promise<Preset[]> {
	return loadDir(join(environment.assetsPath, SHIPPED[kind]), kind, "shipped");
}

export async function loadPersonalPresets(kind: PresetKind): Promise<Preset[]> {
	return loadDir(PERSONAL[kind], kind, "personal");
}

export async function loadPresets(kind: PresetKind): Promise<Preset[]> {
	const [shipped, personal] = await Promise.all([loadShippedPresets(kind), loadPersonalPresets(kind)]);
	return mergePresets(shipped, personal);
}

export async function findPreset(kind: PresetKind, slug: string): Promise<Preset | undefined> {
	const presets = await loadPresets(kind);
	return presets.find((preset) => preset.slug === slug);
}

export function presetsDir(kind: PresetKind): string {
	return PERSONAL[kind];
}

export async function getState(): Promise<AnimState> {
	const text = await readFile(STATE_FILE, "utf8").catch(() => "");
	return parseState(text);
}

export function loaderInstalled(): Promise<boolean> {
	return readFile(HYPRLAND_FILE, "utf8").then(
		(text) => /animations\/active/.test(text),
		() => false,
	);
}

async function reloadHyprland(): Promise<CommandResult> {
	const reload = await run("hyprctl", ["reload"]);
	if (!reload.ok) return reload;

	const errors = await run("hyprctl", ["configerrors"]);
	if (errors.ok && errors.stdout.trim()) return { ok: false, error: errors.stdout.trim() };
	return { ok: true, stdout: "" };
}

// The live border is not a fixed file: every rewrite re-resolves the palette,
// so a theme change is picked up by the next apply or reload rather than
// frozen at apply time. The shipped file is the fallback when no palette can
// be read, and a personal file with the same slug is the user's fork and is
// used as-is.
async function borderLayer(slug: string | null): Promise<Pick<Preset, "slug" | "source"> | undefined> {
	if (!slug) return undefined;
	const preset = await findPreset("border", slug);
	if (!preset || preset.origin !== "shipped" || !BORDER_STYLES[preset.slug]) return preset;
	const live = await liveBorder(preset.slug);
	return live.ok ? { slug: preset.slug, source: live.source } : preset;
}

// Everything is one generated file, so a change to one layer has to re-emit the
// other two: Hyprland reloads the whole config and the previous file is gone.
async function rewrite(state: AnimState): Promise<CommandResult> {
	const base = await readFile(join(environment.assetsPath, "base.lua"), "utf8");
	const [animation, border] = await Promise.all([
		state.last ? findPreset("animation", state.last) : undefined,
		borderLayer(state.border),
	]);
	const shader = state.shader
		? await access(SHADER_FILE).then(
				() => ({ slug: state.shader as string, path: SHADER_FILE }),
				() => null,
			)
		: null;

	await mkdir(ANIM_DIR, { recursive: true });
	await writeFile(
		ACTIVE_FILE,
		composeActive(base, { enabled: state.enabled, animation, border, borderSize: BORDER_SIZE, shader }),
		"utf8",
	);
	await writeFile(STATE_FILE, formatState(state), "utf8");
	return reloadHyprland();
}

export async function applyPreset(kind: PresetKind, preset: Preset): Promise<CommandResult> {
	// Fail loudly instead of silently applying the frozen fallback colours when
	// the user asked for the live palette and there is no palette to read.
	if (kind === "border" && preset.origin === "shipped" && BORDER_STYLES[preset.slug]) {
		const live = await liveBorder(preset.slug);
		if (!live.ok) return { ok: false, error: live.error };
	}
	const state = await getState();
	if (kind === "animation") {
		return rewrite({ ...state, enabled: true, last: preset.slug });
	}
	if (kind === "shader") {
		const dir = preset.origin === "personal" ? PERSONAL.shader : join(environment.assetsPath, SHIPPED.shader);
		await mkdir(ANIM_DIR, { recursive: true });
		await copyFile(join(dir, `${preset.slug}${EXTENSION.shader}`), SHADER_FILE);
		return rewrite({ ...state, shader: preset.slug });
	}
	return rewrite({ ...state, border: preset.slug });
}

export async function clearPreset(kind: "border" | "shader"): Promise<CommandResult> {
	const state = await getState();
	return rewrite(kind === "border" ? { ...state, border: null } : { ...state, shader: null });
}

export async function disableAnimations(): Promise<CommandResult> {
	const state = await getState();
	return rewrite({ ...state, enabled: false });
}

export function reload(): Promise<CommandResult> {
	return reloadHyprland();
}
