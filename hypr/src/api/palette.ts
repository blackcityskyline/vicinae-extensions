import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import {
	BORDER_STYLES,
	COLORBLIND_SLUG,
	DUOTONE_SLUG,
	TINT_SLUG,
	borderColors,
	parseDch,
	parseDux,
	parseSkwdFlat,
	parseSkwdScheme,
	renderBorder,
	renderColorblindShader,
	renderDuotoneShader,
	renderTintShader,
	resolvePalette,
	tintColor,
	type ColorblindType,
	type PaletteInput,
	type Parser,
} from "~/utils/palette.ts";

const HOME = homedir();
const STATE_DIR = process.env.XDG_STATE_HOME || join(HOME, ".local", "state");
const CACHE_DIR = process.env.XDG_CACHE_HOME || join(HOME, ".cache");

// DCH first: it is the hub's canonical palette whatever produced it. Dux and
// skwd follow so the presets still work in a session without the hub.
const SOURCES: Array<{ path: string; parse: Parser }> = [
	{ path: join(STATE_DIR, "dch", "palette.json"), parse: parseDch },
	{ path: join(CACHE_DIR, "dms", "dms-colors.json"), parse: parseDux },
	{ path: join(CACHE_DIR, "skwd-wall-v2", "scheme.json"), parse: parseSkwdScheme },
	{ path: join(CACHE_DIR, "skwd-wall-v2", "skwd-colors.json"), parse: parseSkwdFlat },
];

export type LiveSource = { ok: true; source: string } | { ok: false; error: string };

function missing(roles: string): string {
	const paths = SOURCES.map(({ path }) => path.replace(HOME, "~")).join(", ");
	return `No palette with ${roles} in ${paths}.`;
}

async function readSources(): Promise<PaletteInput[]> {
	return Promise.all(
		SOURCES.map(async (source) => ({
			parse: source.parse,
			text: await readFile(source.path, "utf8").catch(() => null),
		})),
	);
}

export async function liveBorder(slug: string): Promise<LiveSource> {
	const style = BORDER_STYLES[slug];
	if (!style) return { ok: false, error: `Unknown live border: ${slug}.` };
	const palette = resolvePalette(await readSources(), (candidate) => borderColors(candidate).length >= 2);
	if (!palette) return { ok: false, error: missing("primary, secondary, tertiary or error") };
	return { ok: true, source: renderBorder(borderColors(palette), style) };
}

export async function liveTint(role: string): Promise<LiveSource> {
	const palette = resolvePalette(await readSources(), (candidate) => tintColor(candidate, role) !== null);
	const tint = palette ? tintColor(palette, role) : null;
	if (!tint) return { ok: false, error: missing(role) };
	return { ok: true, source: renderTintShader(tint) };
}

export async function liveDuotone(shadow: string, highlight: string): Promise<LiveSource> {
	const palette = resolvePalette(await readSources(), (candidate) => {
		return tintColor(candidate, shadow) !== null && tintColor(candidate, highlight) !== null;
	});
	if (!palette) return { ok: false, error: missing(`${shadow} and ${highlight}`) };
	return {
		ok: true,
		source: renderDuotoneShader(tintColor(palette, shadow)!, tintColor(palette, highlight)!),
	};
}

// Colour-blind correction has no palette dependency: its matrix comes from the
// deficiency type alone.
export function liveColorblind(type: ColorblindType): LiveSource {
	return { ok: true, source: renderColorblindShader(type) };
}

export async function liveShader(
	slug: string,
	options: { tintRole: string; duotoneShadows: string; duotoneHighlights: string; colorblindType: ColorblindType },
): Promise<LiveSource> {
	if (slug === TINT_SLUG) return liveTint(options.tintRole);
	if (slug === DUOTONE_SLUG) return liveDuotone(options.duotoneShadows, options.duotoneHighlights);
	if (slug === COLORBLIND_SLUG) return liveColorblind(options.colorblindType);
	return { ok: false, error: `Not a generated shader: ${slug}.` };
}
