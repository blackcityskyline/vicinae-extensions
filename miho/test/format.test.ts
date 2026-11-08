import assert from "node:assert/strict";

import { formatBytes, formatClock, formatDate, formatDelay, formatDuration } from "../src/utils/format.ts";

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

check("a delay is whole milliseconds", () => {
	assert.equal(formatDelay(184), "184 ms");
	assert.equal(formatDelay(284.6), "285 ms");
	assert.equal(formatDelay(0.4), "—");
});

check("no answer is a dash, not zero", () => {
	assert.equal(formatDelay(undefined), "—");
	assert.equal(formatDelay(null), "—");
	assert.equal(formatDelay(0), "—");
	assert.equal(formatDelay(-1), "—");
});

check("the provider timestamp is a clock, not an epoch", () => {
	assert.match(formatClock("2026-11-08T04:01:49.425937563+03:00"), /^\d{2}:\d{2}:\d{2}$/);
	assert.equal(formatClock(null), "—");
	assert.equal(formatClock("not a date"), "—");
});

check("traffic is binary, one decimal below a hundred", () => {
	assert.equal(formatBytes(0), "0 B");
	assert.equal(formatBytes(1023), "1023 B");
	assert.equal(formatBytes(1024), "1.0 KB");
	assert.equal(formatBytes(18_496 + 18_497), "36.1 KB");
	assert.equal(formatBytes(20 * 1024 ** 3), "20.0 GB");
	assert.equal(formatBytes(150 * 1024 ** 2), "150 MB");
	assert.equal(formatBytes(null), "—");
	assert.equal(formatBytes(-1), "—");
});

check("a duration picks the largest unit that is not zero", () => {
	assert.equal(formatDuration(0), "0 s");
	assert.equal(formatDuration(59.9), "59 s");
	assert.equal(formatDuration(60), "1 m");
	assert.equal(formatDuration(3 * 3600 + 12 * 60), "3 h 12 m");
	assert.equal(formatDuration(2 * 86400 + 4 * 3600), "2 d 4 h");
	assert.equal(formatDuration(undefined), "—");
});

check("the subscription expiry is a date", () => {
	assert.match(formatDate(1794690000), /^\d{1,2} \w{3} \d{4}$/);
	assert.equal(formatDate(0), "—");
	assert.equal(formatDate(null), "—");
});

console.log(`\n${checks} checks passed`);
if (process.exitCode) process.exit(process.exitCode);
