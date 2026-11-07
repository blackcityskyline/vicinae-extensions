import assert from "node:assert/strict";

import { applySample, initialRateState } from "../src/utils/rates.ts";
import type { DevSample } from "../src/utils/parse.ts";

const sample = (rx: number, tx: number, iface = "eth0"): DevSample => ({
	rx,
	tx,
	iface,
	interfaces: { [iface]: { rx, tx } },
});

const near = (actual: number, expected: number) =>
	assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

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

check("the first sample is a baseline, not a rate", () => {
	const state = applySample(initialRateState(), sample(1000, 500), 10_000);
	assert.equal(state.smoothDown, 0);
	assert.equal(state.history.length, 0);
	assert.equal(state.prevAt, 10_000);
});

check("a rate is the counter delta over the elapsed seconds", () => {
	const first = applySample(initialRateState(), sample(1000, 500), 10_000);
	const state = applySample(first, sample(3048, 1524), 12_000);
	near(state.down, 1024);
	near(state.up, 512);
	near(state.smoothDown, 1024);
	near(state.sessionDown, 2048);
	near(state.sessionUp, 1024);
	assert.deepEqual(state.history, [{ t: 12, down: 1024, up: 512 }]);
	assert.deepEqual(state.ifaceRates.eth0, { down: 1024, up: 512 });
});

check("the smoothed rate is upstream's 0.45 / 0.55 blend", () => {
	const first = applySample(initialRateState(), sample(1000, 500), 10_000);
	const second = applySample(first, sample(3048, 1524), 12_000);
	const third = applySample(second, sample(3048, 1524), 14_000);
	near(third.down, 0);
	near(third.smoothDown, 1024 * 0.45);
	near(third.smoothUp, 512 * 0.45);
	near(third.sessionDown, 2048);
	assert.equal(third.history.length, 2);
});

check("the peak follows the smoothed rate, not the instantaneous one", () => {
	let state = applySample(initialRateState(), sample(0, 0), 1000);
	state = applySample(state, sample(2048, 0), 3000);
	state = applySample(state, sample(2048, 0), 5000);
	state = applySample(state, sample(6048, 0), 7000);
	// inst is 2000; smooth is 460.8 * 0.45 + 2000 * 0.55.
	near(state.down, 2000);
	near(state.peakDown, 1024 * 0.45 * 0.45 + 2000 * 0.55);
	assert.ok(state.peakDown < state.down);
});

check("samples closer than a quarter second use the quarter-second floor", () => {
	const first = applySample(initialRateState(), sample(1000, 0), 10_000);
	const state = applySample(first, sample(2024, 0), 10_100);
	near(state.down, 4096);
});

check("a reset counter reads as zero traffic, not as a negative spike", () => {
	const first = applySample(initialRateState(), sample(5000, 5000), 10_000);
	const second = applySample(first, sample(6000, 6000), 12_000);
	const state = applySample(second, sample(100, 100), 14_000);
	near(state.down, 0);
	near(state.sessionDown, 1000);
});

check("changing the measured interface costs one interval of baseline", () => {
	const first = applySample(initialRateState(), sample(1000, 500), 10_000);
	const second = applySample(first, sample(3048, 1524), 12_000);
	const state = applySample(second, sample(99999, 99999, "all"), 14_000);
	near(state.smoothDown, 1024);
	assert.equal(state.history.length, 1);
	assert.equal(state.prev?.iface, "all");
});

check("history older than half an hour is dropped", () => {
	let state = applySample(initialRateState(), sample(0, 0), 1_000_000);
	state = applySample(state, sample(1024, 0), 1_002_000);
	assert.equal(state.history.length, 1);
	state = applySample(state, sample(2048, 0), 2_813_000);
	assert.equal(state.history.length, 1);
	assert.equal(state.history[0]?.t, 2813);
});

check("per-interface rates need the interface in both samples", () => {
	const first = applySample(
		initialRateState(),
		{ rx: 0, tx: 0, iface: "all", interfaces: { eth0: { rx: 0, tx: 0 }, wlan0: { rx: 0, tx: 0 } } },
		10_000,
	);
	const state = applySample(
		first,
		{
			rx: 0,
			tx: 0,
			iface: "all",
			interfaces: { eth0: { rx: 2000, tx: 0 }, wlan0: { rx: 0, tx: 4000 }, wg0: { rx: 9, tx: 9 } },
		},
		12_000,
	);
	assert.deepEqual(state.ifaceRates.eth0, { down: 1000, up: 0 });
	assert.deepEqual(state.ifaceRates.wlan0, { down: 0, up: 2000 });
	assert.equal(state.ifaceRates.wg0, undefined);
});

console.log(`${checks} checks passed`);