import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
	applyEvent,
	bandwidthToMbps,
	fromPython,
	initialState,
	takeLines,
} from "../src/utils/speedtest.ts";

const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8");

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

check("fromPython reads the fixture", () => {
	const data = JSON.parse(fixture("speedtest-python.json"));
	const state = fromPython(data);
	assert.equal(state.phase, "complete");
	assert.equal(state.downloadMbps, 70.08969292436622);
	assert.equal(state.uploadMbps, 66.04576085671513);
	assert.equal(state.pingMs, 10.205);
	assert.equal(state.isp, "Example ISP");
	assert.equal(state.externalIp, "203.0.113.7");
	assert.equal(state.server.name, "Example Networks");
	assert.equal(state.server.location, "Minsk");
	assert.equal(state.server.country, "Belarus");
	assert.equal(state.server.id, "44795");
	assert.equal(state.server.distanceKm, 0.28596050997418726);
	assert.ok(state.result);
});

check("fromPython rejects a missing download", () => {
	const data = JSON.parse(fixture("speedtest-python.json"));
	delete (data as any).download;
	const state = fromPython(data);
	assert.equal(state.phase, "failed");
	assert.equal(state.error, "speedtest-cli returned an incomplete result.");
});

check("fromPython rejects a negative or NaN download", () => {
	const base = JSON.parse(fixture("speedtest-python.json"));
	const neg = { ...base, download: -1 };
	assert.equal(fromPython(neg).phase, "failed");
	const nan = { ...base, download: NaN };
	assert.equal(fromPython(nan).phase, "failed");
});

check("Ookla events reduce to a complete result", () => {
	const lines = fixture("ookla-events.jsonl").trim().split("\n");
	let state = initialState();
	for (const line of lines) {
		const event = JSON.parse(line);
		state = applyEvent(state, event);
	}
	assert.equal(state.phase, "complete");
	assert.equal(state.downloadMbps, 250);
	assert.equal(state.uploadMbps, 115);
	assert.equal(state.pingMs, 38.2);
	assert.equal(state.jitterMs, 1.1);
	assert.equal(state.isp, "Example Transit");
	assert.equal(state.externalIp, "203.0.113.10");
	assert.equal(state.server.name, "Example Network");
	assert.equal(state.server.location, "Seattle, WA");
	assert.equal(state.server.country, "United States");
	assert.equal(state.server.id, "12345");
	assert.equal(state.resultUrl, "https://www.speedtest.net/result/c/00000000-0000-0000-0000-000000000000");
	assert.ok(state.result);
});

check("a non-object event is ignored", () => {
	const state = initialState();
	assert.equal(applyEvent(state, 42), state);
	assert.equal(applyEvent(state, null), state);
});

check("a download event after a completed result does not change it", () => {
	const lines = fixture("ookla-events.jsonl").trim().split("\n");
	let state = initialState();
	for (const line of lines) state = applyEvent(state, JSON.parse(line));
	const before = state.downloadMbps;
	state = applyEvent(state, { type: "download", download: { bandwidth: 1 } });
	assert.equal(state.downloadMbps, before);
});

check("bandwidthToMbps conversions", () => {
	assert.equal(bandwidthToMbps(0), 0);
	assert.equal(bandwidthToMbps(-1), null);
	assert.equal(bandwidthToMbps(Infinity), null);
	assert.equal(bandwidthToMbps("5"), null);
	assert.equal(bandwidthToMbps(null), null);
	assert.equal(bandwidthToMbps(1_000_000), 8);
});

check("Ookla progress becomes a clamped ratio", () => {
	assert.equal(initialState().progress, null);
	const ping = applyEvent(initialState(), { type: "ping", ping: { latency: 1, progress: 0.25 } });
	assert.equal(ping.progress, 0.25);
	const down = applyEvent(ping, { type: "download", download: { bandwidth: 1000, progress: 0.5 } });
	assert.equal(down.progress, 0.5);
	const over = applyEvent(down, { type: "download", download: { bandwidth: 1000, progress: 2 } });
	assert.equal(over.progress, 1);
	const under = applyEvent(down, { type: "download", download: { bandwidth: 1000, progress: -1 } });
	assert.equal(under.progress, 0);
	const absent = applyEvent(down, { type: "download", download: { bandwidth: 1000 } });
	assert.equal(absent.progress, 0.5);
	const junk = applyEvent(down, { type: "download", download: { bandwidth: 1000, progress: "x" } });
	assert.equal(junk.progress, 0.5);
});

check("a result event with only one direction fails", () => {
	const state = applyEvent(initialState(), { type: "result", download: { bandwidth: 1000 } });
	assert.equal(state.phase, "failed");
	assert.equal(state.error, "Speedtest returned an incomplete result.");
});

check("a log error event sets error", () => {
	const state = applyEvent(initialState(), { type: "log", level: "error", message: "boom" });
	assert.equal(state.error, "boom");
});

check("takeLines handles chunks", () => {
	const a = takeLines("a\nb");
	assert.deepEqual(a.lines, ["a"]);
	assert.equal(a.rest, "b");
	const b = takeLines("a\nb\nc");
	assert.deepEqual(b.lines, ["a", "b"]);
	assert.equal(b.rest, "c");
	const c = takeLines("a\r\nb\r\n");
	assert.deepEqual(c.lines, ["a", "b"]);
	assert.equal(c.rest, "");
	const d = takeLines("a\n\nb");
	assert.deepEqual(d.lines, ["a", ""]);
	assert.equal(d.rest, "b");
	const e = takeLines("");
	assert.deepEqual(e.lines, []);
	assert.equal(e.rest, "");
});

console.log(`${checks} checks passed`);
