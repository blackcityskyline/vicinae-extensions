import type { HistoryPoint } from "./rates.ts";

const BLOCKS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

export function sparkline(
	points: readonly HistoryPoint[],
	key: "down" | "up",
	windowSeconds: number,
	nowMs: number,
	width: number,
): string {
	if (points.length === 0 || width <= 0 || windowSeconds <= 0) return "";
	const now = nowMs / 1000;
	const start = now - windowSeconds;
	const buckets = new Array<number>(width).fill(0);
	let max = 0;
	for (const point of points) {
		if (point.t < start || point.t > now) continue;
		const index = Math.min(width - 1, Math.floor(((point.t - start) / windowSeconds) * width));
		const value = Math.max(0, point[key]);
		if (value > (buckets[index] ?? 0)) buckets[index] = value;
		if (value > max) max = value;
	}
	return buckets
		.map((value) => BLOCKS[max === 0 ? 0 : Math.min(7, Math.floor((value / max) * 8))])
		.join("");
}