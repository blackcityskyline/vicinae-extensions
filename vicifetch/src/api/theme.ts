import { environment } from "@vicinae/api";
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { stripJsonComments } from "../utils/jsonc";
import { swatchPng, swatchSize } from "../utils/palette-image";
import { parseAccents } from "../utils/theme-colors";

const CONFIG_FILE = "settings.json";
const THEME_DIRECTORY = "themes";
const DEFAULT_DATA_DIRS = ["/usr/local/share", "/usr/share"];

const dataDirectories = () => (process.env.XDG_DATA_DIRS ?? DEFAULT_DATA_DIRS.join(":")).split(":");

const settingsPath = () =>
	join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "vicinae", CONFIG_FILE);

const themeDirectories = () => [
	join(process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), "vicinae", THEME_DIRECTORY),
	...dataDirectories().map((directory) => join(directory, "vicinae", THEME_DIRECTORY)),
];

/** `theme.dark.name` / `theme.light.name` from the launcher's own config. */
function themeName(): string | undefined {
	try {
		const settings = JSON.parse(stripJsonComments(readFileSync(settingsPath(), "utf8"))) as {
			theme?: Record<string, { name?: unknown } | undefined>;
		};
		const themes = settings.theme;
		const chosen =
			themes?.[environment.appearance]?.name ?? themes?.dark?.name ?? themes?.light?.name;
		return typeof chosen === "string" && chosen !== "" ? chosen : undefined;
	} catch {
		return undefined;
	}
}

/**
 * The accent palette of the launcher's active theme. A builtin theme has no file
 * on disk, so the row is simply absent for it.
 */
export function readThemePalette(): { name: string; hex: string }[] {
	const name = themeName();
	if (!name) return [];

	for (const directory of themeDirectories()) {
		const file = join(directory, `${name}.toml`);
		if (!existsSync(file)) continue;
		try {
			return parseAccents(readFileSync(file, "utf8"));
		} catch {
			return [];
		}
	}
	return [];
}

/**
 * Writes the palette into the extension's support directory and returns a
 * `file://` URL with the pixel size a rich-text `<img>` must be given. The name
 * carries the colours because the launcher may cache images by path; older
 * palettes are removed so the directory holds one.
 */
export function writePaletteImage(
	palette: { hex: string }[],
): { url: string; width: number; height: number } | undefined {
	const hexes = palette.map((colour) => colour.hex);
	const png = swatchPng(hexes);
	if (png.length === 0) return undefined;

	const name = `palette-${hexes.map((hex) => hex.replace("#", "")).join("-")}.png`;
	const path = join(environment.supportPath, name);

	try {
		mkdirSync(environment.supportPath, { recursive: true });
		for (const file of readdirSync(environment.supportPath)) {
			if (file.startsWith("palette-") && file !== name) unlinkSync(join(environment.supportPath, file));
		}
		writeFileSync(path, png);
		return { url: `file://${path}`, ...swatchSize(hexes.length) };
	} catch {
		return undefined;
	}
}
