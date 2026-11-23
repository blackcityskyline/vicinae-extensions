import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { DEFAULT_INK } from "~/lib/cards";

/**
 * The launcher's own text colour, for cards drawn without a plate: a transparent
 * card sits on the pane's theme background, so its ink has to be the theme's, or
 * a light theme gets light-on-light.
 *
 * The extension API exposes no colours (`environment` has `appearance` alone),
 * and Qt's SVG renderer resolves neither CSS variables nor system colours, so
 * the colour is read from the theme file the launcher itself loaded. Same
 * approach as `ytmusic`'s `lib/theme.ts`.
 */

/** The `[colors.core] foreground` of a theme file, if it declares one. */
export function parseTheme(toml: string): string | undefined {
	let section = "";
	for (const raw of toml.split("\n")) {
		const header = raw.match(/^\s*\[([^\]]+)\]\s*(?:#.*)?$/);
		if (header) {
			section = header[1]!.trim();
			continue;
		}
		if (section !== "colors.core") continue;
		const ink = raw.match(/^\s*foreground\s*=\s*"(#[0-9a-fA-F]{3,8})"/);
		if (ink) return ink[1];
	}
	return undefined;
}

function read(path: string): string | undefined {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return undefined;
	}
}

/** `settings.json` is JSONC: comments and trailing commas are allowed. */
function jsonc(text: string): string {
	return text
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/^\s*\/\/.*$/gm, "")
		.replace(/,(\s*[}\]])/g, "$1");
}

type Settings = { theme?: Partial<Record<"light" | "dark", { name?: string }>> };

function themeDirs(): string[] {
	const dataHome = process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
	return [join(dataHome, "vicinae", "themes"), "/usr/local/share/vicinae/themes", "/usr/share/vicinae/themes"];
}

/**
 * The text colour of the theme the launcher is wearing. The appearance picks the
 * variant; a settings file that names only one theme answers for both. Anything
 * unreadable falls back to the colour the cards were drawn with.
 */
export function themeInk(appearance: "light" | "dark"): string {
	const configHome = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
	const raw = read(join(configHome, "vicinae", "settings.json"));
	if (!raw) return DEFAULT_INK;

	let settings: Settings;
	try {
		settings = JSON.parse(jsonc(raw)) as Settings;
	} catch {
		return DEFAULT_INK;
	}

	const order = [appearance, appearance === "dark" ? "light" : "dark"] as const;
	for (const variant of order) {
		const name = settings.theme?.[variant]?.name;
		if (!name || name.includes("/") || name.includes("..")) continue;
		for (const dir of themeDirs()) {
			// The theme id is the file name without the extension.
			const toml = read(join(dir, `${name}.toml`));
			if (!toml) continue;
			const ink = parseTheme(toml);
			if (ink) return ink;
		}
	}

	return DEFAULT_INK;
}
