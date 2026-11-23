import { themeInk } from "./theme.ts";
import { formatBytes, formatRate } from "../utils/format.ts";

/**
 * The detail pane's graphics, drawn as cards the way `ytmusic` and
 * `player-pilot` do it: SVG in a data URI, transparent so the pane's own
 * background shows through, ink taken from the launcher's theme.
 *
 * Every card is redrawn whenever `rates` or the speed test changes — the
 * throughput view samples every second or two — so the charts move while the
 * pane is open. Qt's SVG module does not animate, so the motion is the redraw.
 */
export const CARD_W = 420;
export const CHART_H = 196;
export const SPEED_H = 150;

/** Drawn at 2×: the pane scales the card up to roughly 1.12, text stays crisp. */
const S = 2;
const PAD = 20;
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
const DOWN_INK = "#4cc2ff";
const UP_INK = "#ffb020";

let ink = "#e6e7ea";

export function configureInk(appearance: "light" | "dark"): void {
	ink = themeInk(appearance);
}

const round = (value: number) => (Math.round(value * 10) / 10).toString();

/** The text goes inside the SVG, so `&` and `<` must not break the document. */
function escapeXml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

/** One line, cut with an ellipsis: a card has no room to wrap. */
function fit(text: string, max: number): string {
	return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

const svg = (height: number, body: string) =>
	`<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W * S}" height="${height * S}" viewBox="0 0 ${CARD_W} ${height}">${body}</svg>`;

/** A card as markdown, in the box the pane should give it. */
export function cardToMarkdown(card: string, height: number): string {
	const encoded = encodeURIComponent(card).replace(/\(/g, "%28").replace(/\)/g, "%29");
	return `![](data:image/svg+xml?raycast-width=${CARD_W}&raycast-height=${height}#x,${encoded})`;
}

function arrow(cx: number, cy: number, up: boolean, fill: string): string {
	const head = up ? `M${cx - 5} ${cy + 2} h10 l-5 -8 z` : `M${cx - 5} ${cy - 2} h10 l-5 8 z`;
	const stem = up
		? `<rect x="${cx - 1.2}" y="${cy - 1}" width="2.4" height="7"/>`
		: `<rect x="${cx - 1.2}" y="${cy - 8}" width="2.4" height="7"/>`;
	return `<path d="${head}" fill="${fill}"/><g fill="${fill}">${stem}</g>`;
}

export interface DirectionStats {
	current: number;
	peak: number;
	session: number;
}

/** Both directions on one time axis: the row pair is one stream, not two. */
export interface ChartCard {
	iface: string;
	down: DirectionStats;
	up: DirectionStats;
	downSeries: (number | null)[];
	upSeries: (number | null)[];
	windowSeconds: number;
}

/**
 * Fills the gaps between samples with the previous value, so a sampled line
 * holds instead of dropping to zero, and leaves the window before the first
 * sample empty.
 */
function hold(series: readonly (number | null)[]): (number | null)[] {
	const out = series.slice();
	let previous: number | null = null;
	for (let index = 0; index < out.length; index++) {
		const value = out[index];
		if (value === null || value === undefined) out[index] = previous;
		else previous = value;
	}
	return out;
}

function seriesPoints(series: (number | null)[], xAt: (i: number) => number, yAt: (v: number) => number): string[] {
	const points: string[] = [];
	for (let index = 0; index < series.length; index++) {
		const value = series[index];
		if (value === null || value === undefined) continue;
		points.push(`${round(xAt(index))} ${round(yAt(value))}`);
	}
	return points;
}

function drawSeries(points: string[], fill: string, accent: string, x0: number, x1: number, y1: number): string {
	if (points.length === 0) return "";
	const line = points.map((point, index) => `${index === 0 ? "M" : "L"}${point}`).join(" ");
	return (
		`<path d="${line} L${round(x1)} ${y1} L${round(x0)} ${y1} Z" fill="url(#${fill})"/>` +
		`<path d="${line}" fill="none" stroke="${accent}" stroke-width="2" stroke-linejoin="round"/>` +
		`<circle cx="${points[points.length - 1]!.split(" ")[0]}" cy="${points[points.length - 1]!.split(" ")[1]}" r="3" fill="${accent}"/>`
	);
}

export function throughputCard(card: ChartCard): string {
	const down = hold(card.downSeries);
	const up = hold(card.upSeries);
	const values = [...down, ...up].filter((value): value is number => value !== null && value !== undefined);
	const max = values.length ? Math.max(...values) : 0;
	const x0 = PAD;
	const x1 = CARD_W - PAD;
	const y0 = 112;
	const y1 = 180;
	const columns = Math.max(down.length, up.length);
	const xAt = (index: number) => (columns <= 1 ? x1 : x0 + (index / (columns - 1)) * (x1 - x0));
	const yAt = (value: number) => y1 - (value / (max > 0 ? max : 1)) * (y1 - y0);
	const downPoints = seriesPoints(down, xAt, yAt);
	const upPoints = seriesPoints(up, xAt, yAt);

	const gradient = (id: string, accent: string) =>
		`<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">` +
		`<stop offset="0%" stop-color="${accent}" stop-opacity="0.2"/>` +
		`<stop offset="100%" stop-color="${accent}" stop-opacity="0.01"/>` +
		`</linearGradient>`;

	let body = `<defs>${gradient("downFill", DOWN_INK)}${gradient("upFill", UP_INK)}</defs>`;
	body +=
		`<text x="${x0}" y="28" font-family="${FONT}" font-size="10" font-weight="700" ` +
		`letter-spacing="1.4" fill="${ink}" opacity="0.55">THROUGHPUT</text>` +
		`<text x="${x1}" y="28" font-family="${FONT}" font-size="11" fill="${ink}" opacity="0.42" ` +
		`text-anchor="end">${escapeXml(fit(card.iface, 24))}</text>`;

	const column = (at: number, accent: string, label: string, stats: DirectionStats) =>
		`<circle cx="${at + 3}" cy="48" r="3" fill="${accent}"/>` +
		`<text x="${at + 12}" y="52" font-family="${FONT}" font-size="9" font-weight="700" ` +
		`letter-spacing="1.3" fill="${ink}" opacity="0.5">${label}</text>` +
		`<text x="${at}" y="78" font-family="${FONT}" font-size="20" font-weight="700" ` +
		`fill="${accent}">${escapeXml(formatRate(stats.current))}</text>` +
		`<text x="${at}" y="94" font-family="${FONT}" font-size="10" fill="${ink}" opacity="0.5">` +
		`${escapeXml(`peak ${formatRate(stats.peak)} · ${formatBytes(stats.session)}`)}</text>`;

	body += column(x0, DOWN_INK, "DOWNLOAD", card.down);
	body += column(x0 + 190, UP_INK, "UPLOAD", card.up);
	body +=
		`<text x="${x0}" y="104" font-family="${FONT}" font-size="9" fill="${ink}" opacity="0.4">` +
		`${escapeXml(
			values.length === 0
				? ""
				: `${Math.round(card.windowSeconds / 60)} min · ${max > 0 ? `max ${formatRate(max)}` : "no traffic"}`,
		)}</text>`;

	for (const fraction of [0.25, 0.5, 0.75]) {
		const y = round(y1 - fraction * (y1 - y0));
		body += `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="${ink}" stroke-opacity="0.07"/>`;
	}
	body += `<line x1="${x0}" y1="${y1}" x2="${x1}" y2="${y1}" stroke="${ink}" stroke-opacity="0.16"/>`;

	if (values.length > 0) {
		body += drawSeries(downPoints, "downFill", DOWN_INK, x0, x1, y1);
		body += drawSeries(upPoints, "upFill", UP_INK, x0, x1, y1);
	} else {
		body +=
			`<text x="${(x0 + x1) / 2}" y="${y0 + 34}" font-family="${FONT}" font-size="11" fill="${ink}" ` +
			`opacity="0.4" text-anchor="middle">collecting samples…</text>`;
	}

	return svg(CHART_H, body);
}

/** The speed test: both directions, the run's state and the latency beside it. */
export interface SpeedCard {
	status: string;
	running: boolean;
	download: string;
	upload: string;
	latency: string | null;
	jitter: string | null;
}

export function speedCard(card: SpeedCard): string {
	const column = CARD_W / 2;
	const right = column + PAD;
	const foot = [card.latency ? `Latency ${card.latency}` : "", card.jitter ? `Jitter ${card.jitter}` : ""]
		.filter(Boolean)
		.join(" · ");

	let body =
		arrow(PAD + 5, 20, false, DOWN_INK) +
		arrow(right + 5, 20, true, UP_INK) +
		`<text x="${PAD + 16}" y="24" font-family="${FONT}" font-size="10" font-weight="700" ` +
		`letter-spacing="1.4" fill="${ink}" opacity="0.55">DOWNLOAD</text>` +
		`<text x="${right + 16}" y="24" font-family="${FONT}" font-size="10" font-weight="700" ` +
		`letter-spacing="1.4" fill="${ink}" opacity="0.55">UPLOAD</text>`;
	body +=
		`<text x="${PAD}" y="68" font-family="${FONT}" font-size="26" font-weight="700" ` +
		`fill="${DOWN_INK}">${escapeXml(card.download)}</text>` +
		`<text x="${right}" y="68" font-family="${FONT}" font-size="26" font-weight="700" ` +
		`fill="${UP_INK}">${escapeXml(card.upload)}</text>`;
	body +=
		`<line x1="${column}" y1="14" x2="${column}" y2="80" stroke="${ink}" stroke-opacity="0.1"/>` +
		`<line x1="${PAD}" y1="96" x2="${CARD_W - PAD}" y2="96" stroke="${ink}" stroke-opacity="0.12"/>`;
	body +=
		`<circle cx="${PAD + 3}" cy="120" r="3" fill="${card.running ? DOWN_INK : ink}" ` +
		`fill-opacity="${card.running ? 1 : 0.35}"/>` +
		`<text x="${PAD + 12}" y="124" font-family="${FONT}" font-size="11" fill="${ink}" ` +
		`opacity="0.6">${escapeXml(fit(card.status, 30))}</text>`;
	if (foot) {
		body +=
			`<text x="${CARD_W - PAD}" y="124" font-family="${FONT}" font-size="11" fill="${ink}" ` +
			`opacity="0.5" text-anchor="end">${escapeXml(foot)}</text>`;
	}

	return svg(SPEED_H, body);
}
