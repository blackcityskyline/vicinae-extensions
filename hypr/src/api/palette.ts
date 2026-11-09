import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import {
	BORDER_STYLES,
	borderColors,
	parseDch,
	parseDux,
	parseSkwdFlat,
	parseSkwdScheme,
	renderBorder,
	resolvePalette,
	type Parser,
} from "~/utils/palette.ts";

const HOME = homedir();
const STATE_DIR = process.env.XDG_STATE_HOME || join(HOME, ".local", "state");
const CACHE_DIR = process.env.XDG_CACHE_HOME || join(HOME, ".cache");

// DCH first: it is the hub's canonical palette whatever produced it. Dux and
// skwd follow so the preset still works in a session without the hub.
const SOURCES: Array<{ path: string; parse: Parser }> = [
	{ path: join(STATE_DIR, "dch", "palette.json"), parse: parseDch },
	{ path: join(CACHE_DIR, "dms", "dms-colors.json"), parse: parseDux },
	{ path: join(CACHE_DIR, "skwd-wall-v2", "scheme.json"), parse: parseSkwdScheme },
	{ path: join(CACHE_DIR, "skwd-wall-v2", "skwd-colors.json"), parse: parseSkwdFlat },
];

export type LiveBorder = { ok: true; source: string } | { ok: false; error: string };

export async function liveBorder(slug: string): Promise<LiveBorder> {
	const style = BORDER_STYLES[slug];
	if (!style) return { ok: false, error: `Unknown live border: ${slug}.` };
	const inputs = await Promise.all(
		SOURCES.map(async (source) => ({
			parse: source.parse,
			text: await readFile(source.path, "utf8").catch(() => null),
		})),
	);
	const palette = resolvePalette(inputs);
	if (!palette) {
		const paths = SOURCES.map(({ path }) => path.replace(HOME, "~")).join(", ");
		return { ok: false, error: `No palette with primary, secondary, tertiary or error in ${paths}.` };
	}
	return { ok: true, source: renderBorder(borderColors(palette), style) };
}
