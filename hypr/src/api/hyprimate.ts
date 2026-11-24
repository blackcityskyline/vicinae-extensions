/**
 * Talking to the running compositor and to the one file the extension owns.
 * Everything here is thin: read a setting, send a batch, write the managed
 * block. The shapes are decided in `utils/hyprimate.ts`.
 */

import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { HYPRIMATE_OPTIONS, type HyprimateOption } from "~/utils/hyprimate-catalog.ts";
import {
	configExpression,
	globalOption,
	mergeManagedBlock,
	managedBlock,
	optionKey,
	parseOptionOutput,
	type Assignment,
	type OptionState,
} from "~/utils/hyprimate.ts";

export const HYPR_DIR = join(homedir(), ".config", "hypr");
export const HYPRIMATE_FILE = join(HYPR_DIR, "plugins", "hyprimate.lua");

export type CommandResult = { ok: true; stdout: string } | { ok: false; error: string };

function exec(command: string, args: string[], timeoutMs: number): Promise<CommandResult> {
	return new Promise((resolve) => {
		execFile(command, args, { timeout: timeoutMs, encoding: "utf8" }, (error, stdout, stderr) => {
			const out = (stdout ?? "").trim();
			if (error) {
				const missing = (error as NodeJS.ErrnoException).code === "ENOENT";
				resolve({ ok: false, error: missing ? `${command} is not installed` : (stderr || out || error.message).trim() });
				return;
			}
			resolve({ ok: true, stdout: out });
		});
	});
}

function run(args: string[], timeoutMs = 10_000): Promise<CommandResult> {
	return exec("hyprctl", args, timeoutMs).then((result) => {
		// hyprctl exits 0 for a failed request ("unknown request", "no such
		// option"), so the output decides, not the exit code.
		if (result.ok && (result.stdout.startsWith("error:") || result.stdout === "unknown request"))
			return { ok: false, error: result.stdout };
		return result;
	});
}

export async function readOption(option: HyprimateOption): Promise<OptionState | null> {
	const result = await run(["getoption", optionKey(option)]);
	if (!result.ok) return null;
	return parseOptionOutput(result.stdout);
}

/** Reads a batch, a few at a time so a full sweep does not fork 257 processes at once. */
export async function readOptions(options: readonly HyprimateOption[]): Promise<Map<string, OptionState | null>> {
	const states = new Map<string, OptionState | null>();
	const queue = [...options];
	async function worker() {
		for (let option = queue.shift(); option; option = queue.shift()) {
			states.set(option.path, await readOption(option));
		}
	}
	await Promise.all(Array.from({ length: Math.min(8, queue.length) }, worker));
	return states;
}

/** True when the plugin is loaded: every setting answers `getoption`. */
export async function pluginLoaded(): Promise<boolean> {
	return (await readOption(globalOption("window.style"))) !== null;
}

export type PluginStatus = {
	/** hyprpm knows the repo; without it the install hint is the only useful action. */
	installed: boolean;
	/** hyprpm's own state, which decides whether the next session loads it. */
	enabled: boolean;
	/** Loaded in the running compositor right now. */
	loaded: boolean;
};

const ANSI = /\u001b\[[0-9;]*m/g;

/** `hyprpm list` is the only place that knows both "installed" and "enabled". */
export async function pluginStatus(): Promise<PluginStatus> {
	const loaded = await pluginLoaded();
	const list = await exec("hyprpm", ["list"], 30_000);
	if (!list.ok) return { installed: false, enabled: false, loaded };
	const match = list.stdout.replace(ANSI, "").match(/Plugin\s+hyprimate[\s\S]*?enabled:\s*(true|false)/);
	if (!match) return { installed: false, enabled: false, loaded };
	return { installed: true, enabled: match[1] === "true", loaded };
}

/**
 * hyprpm's own enable/disable also settles the running compositor: disable
 * unloads the plugin, enable loads it. No bare `hyprctl plugin load` here,
 * or hyprpm's state and the compositor would disagree on the next session.
 */
export async function setPluginEnabled(enabled: boolean): Promise<CommandResult> {
	return exec("hyprpm", [enabled ? "enable" : "disable", "hyprimate"], 180_000);
}

export async function applyAssignments(assignments: readonly Assignment[]): Promise<CommandResult> {
	if (assignments.length === 0) return { ok: true, stdout: "" };
	return run(["eval", configExpression(assignments)]);
}

export function applySetting(option: HyprimateOption, value: string | number | boolean): Promise<CommandResult> {
	return applyAssignments([{ option, value }]);
}

export async function currentStyle(setting: "window.style" | "workspace.style"): Promise<string | null> {
	const option = globalOption(setting);
	const state = await readOption(option);
	return state === null || typeof state.value !== "string" ? null : state.value;
}

/**
 * What the session has explicitly set: everything `getoption` reports as set.
 * Saving these is idempotent — a value that came from the config is written
 * back the same way.
 */
export async function sessionAssignments(): Promise<Assignment[]> {
	const states = await readOptions(HYPRIMATE_OPTIONS);
	const assignments: Assignment[] = [];
	for (const option of HYPRIMATE_OPTIONS) {
		const state = states.get(option.path);
		if (!state?.set) continue;
		assignments.push({ option, value: state.value });
	}
	return assignments;
}

/** Writes the managed block into the plugin's Lua file and reloads the config. */
export async function saveToConfig(assignments: readonly Assignment[]): Promise<CommandResult> {
	try {
		const existing = await readFile(HYPRIMATE_FILE, "utf8").catch(() => "");
		await writeFile(HYPRIMATE_FILE, mergeManagedBlock(existing, managedBlock(assignments)), "utf8");
	} catch (error) {
		return { ok: false, error: error instanceof Error ? error.message : String(error) };
	}
	return reload();
}

export async function reload(): Promise<CommandResult> {
	const result = await run(["reload"]);
	if (!result.ok) return result;
	const errors = await run(["configerrors"]);
	if (errors.ok && errors.stdout) return { ok: false, error: errors.stdout };
	return { ok: true, stdout: "" };
}
