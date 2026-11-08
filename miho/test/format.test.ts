import assert from "node:assert/strict";

import { formatClock, formatDelay } from "../src/utils/format.ts";

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

console.log(`\n${checks} checks passed`);
if (process.exitCode) process.exit(process.exitCode);
