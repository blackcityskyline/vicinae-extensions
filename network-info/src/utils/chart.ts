import type { HistoryPoint } from "./rates.ts";

/** Enough slots for a 380 px chart at 2×; the pane never needs more detail. */
export const CHART_COLUMNS = 120;

/**
 * The samples of one direction, bucketed into `columns` slots across the window.
 * A bucket keeps its busiest sample, so a spike inside it still shows; `null`
 * means no sample landed there and the card carries the previous value forward.
 */
export function chartSeries(
	points: readonly HistoryPoint[],
	key: "down" | "up",
	windowSeconds: number,
	nowMs: number,
	columns: number,
): (number | null)[] {
	if (columns <= 0 || windowSeconds <= 0) return [];
	const now = nowMs / 1000;
	const start = now - windowSeconds;
	const series = new Array<number | null>(columns).fill(null);
	for (const point of points) {
		if (point.t < start || point.t > now) continue;
		const index = Math.min(columns - 1, Math.floor(((point.t - start) / windowSeconds) * columns));
		const value = Math.max(0, point[key]);
		const held = series[index];
		if (held === null || held === undefined || value > held) series[index] = value;
	}
	return series;
}
