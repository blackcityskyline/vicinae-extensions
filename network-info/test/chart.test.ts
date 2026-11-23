import assert from "node:assert/strict";

import { CHART_COLUMNS, chartSeries } from "../src/utils/chart.ts";
import type { HistoryPoint } from "../src/utils/rates.ts";

const point = (t: number, value: number): HistoryPoint => ({ t, down: value, up: 0 });

let checks = 0;
function check(name: string, body: () => void) {
	try {
		body();
		checks++;
		console.log(`ok   ${name}`);
	} catch (error) {
		console.log(`FAIL ${name}`);
		console.log(`     ${error instanceof Error ? error.message : error}`);
		process.exitCode = 1;
	}
}

check("no samples leave every bucket empty", () => {
	assert.deepEqual(chartSeries([], "down", 60, 100_000, 4), [null, null, null, null]);
});

check("the newest sample lands in the right edge bucket", () => {
	assert.deepEqual(chartSeries([point(100, 8)], "down", 60, 100_000, 4), [null, null, null, 8]);
});

check("samples are placed by time, not by their order in the array", () => {
	assert.deepEqual(chartSeries([point(90, 8), point(50, 1)], "down", 60, 100_000, 4), [1, null, null, 8]);
});

check("a bucket keeps its busiest sample", () => {
	assert.deepEqual(chartSeries([point(41, 2), point(42, 6)], "down", 60, 100_000, 4), [6, null, null, null]);
});

check("samples older than the window are not drawn", () => {
	assert.deepEqual(chartSeries([point(30, 8), point(100, 8)], "down", 60, 100_000, 4), [null, null, null, 8]);
});

check("the upload series is drawn from the same points", () => {
	assert.deepEqual(chartSeries([{ t: 100, down: 8, up: 4 }], "up", 60, 100_000, 4), [null, null, null, 4]);
});

check("a thirty-minute window keeps spreading samples across the columns", () => {
	const points = Array.from({ length: 900 }, (_, i) => point(1000 + i * 2, i));
	const series = chartSeries(points, "down", 1800, (1000 + 1800) * 1000, CHART_COLUMNS);
	assert.equal(series.length, CHART_COLUMNS);
	assert.ok(series.filter((value) => value !== null).length > 100);
});

check("a window with no dimensions draws nothing", () => {
	assert.deepEqual(chartSeries([point(100, 8)], "down", 60, 100_000, 0), []);
	assert.deepEqual(chartSeries([point(100, 8)], "down", 0, 100_000, 4), []);
});

console.log(`${checks} checks passed`);
