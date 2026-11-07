import assert from "node:assert/strict";

import { sparkline } from "../src/utils/sparkline.ts";
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

check("no samples draw nothing", () => {
	assert.equal(sparkline([], "down", 60, 100_000, 4), "");
});

check("a silent window is a flat baseline", () => {
	assert.equal(
		sparkline([point(50, 0), point(90, 0)], "down", 60, 100_000, 4),
		"▁▁▁▁",
	);
});

check("the newest sample lands at the right edge", () => {
	assert.equal(sparkline([point(100, 8)], "down", 60, 100_000, 4), "▁▁▁█");
});

check("samples are placed by time, not by their order in the array", () => {
	assert.equal(
		sparkline([point(90, 8), point(50, 1)], "down", 60, 100_000, 4),
		"▂▁▁█",
	);
});

check("a bucket shows its busiest sample", () => {
	assert.equal(
		sparkline([point(41, 2), point(42, 6), point(100, 8)], "down", 60, 100_000, 4),
		"▇▁▁█",
	);
});

check("samples older than the window are not drawn", () => {
	assert.equal(sparkline([point(30, 8), point(100, 8)], "down", 60, 100_000, 4), "▁▁▁█");
});

check("the series is scaled to its own maximum", () => {
	assert.equal(sparkline([point(100, 1024)], "down", 60, 100_000, 4), "▁▁▁█");
	assert.equal(sparkline([point(100, 1024 * 1024)], "down", 60, 100_000, 4), "▁▁▁█");
});

check("the upload series is drawn from the same points", () => {
	assert.equal(
		sparkline([{ t: 100, down: 8, up: 4 }], "up", 60, 100_000, 4),
		"▁▁▁█",
	);
	assert.equal(
		sparkline([{ t: 50, down: 8, up: 4 }, { t: 100, down: 8, up: 0 }], "up", 60, 100_000, 4),
		"█▁▁▁",
	);
});

console.log(`${checks} checks passed`);