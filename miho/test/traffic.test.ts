import assert from "node:assert/strict";

import {
	byRate,
	perProcess,
	rateTracker,
	readFindProcessMode,
	routingOf,
	withFindProcessMode,
	type ConnectionCounters,
	type TrackedConnection,
} from "../src/utils/traffic.ts";

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

function counters(id: string, download: number, upload: number): ConnectionCounters {
	return { id, download, upload };
}

function tracked(host: string, process: string, chains: string[], download = 0, upload = 0): TrackedConnection {
	return { id: `${process}:${host}`, host, process, chains, download, upload };
}

check("the bytes of a burst are the rate until the next burst, not zero in between", () => {
	// Measured: a connection's counters stay flat for several seconds, then jump.
	// A one-tick delta would read zero four ticks out of five.
	const tracker = rateTracker();
	assert.equal(tracker.tick([counters("a", 0, 0)], 0).size, 0);
	tracker.tick([counters("a", 0, 0)], 1000);
	assert.deepEqual(tracker.tick([counters("a", 4_400_000, 0)], 6000).get("a"), { down: 880_000, up: 0 });
	assert.deepEqual(tracker.tick([counters("a", 4_400_000, 0)], 7000).get("a"), { down: 880_000, up: 0 });
});

check("a connection seen for the first time reports nothing for one tick", () => {
	const tracker = rateTracker();
	tracker.tick([counters("a", 500, 500)], 0);
	const rates = tracker.tick([counters("a", 600, 600), counters("new", 50_000, 10_000)], 1000);
	assert.equal(rates.size, 1);
	assert.equal(rates.has("new"), false);
});

check("a rate that is held too long falls to zero", () => {
	const tracker = rateTracker(5000);
	tracker.tick([counters("a", 0, 0)], 0);
	assert.deepEqual(tracker.tick([counters("a", 1000, 0)], 1000).get("a"), { down: 1000, up: 0 });
	assert.deepEqual(tracker.tick([counters("a", 1000, 0)], 5000).get("a"), { down: 1000, up: 0 });
	assert.deepEqual(tracker.tick([counters("a", 1000, 0)], 6001).get("a"), { down: 0, up: 0 });
});

check("counters that reset count as zero, never as negative traffic", () => {
	const tracker = rateTracker();
	tracker.tick([counters("a", 5000, 5000)], 0);
	assert.deepEqual(tracker.tick([counters("a", 10, 10)], 1000).get("a"), { down: 0, up: 0 });
});

check("no elapsed time cannot produce a rate", () => {
	const tracker = rateTracker();
	tracker.tick([counters("a", 0, 0)], 1000);
	assert.equal(tracker.tick([counters("a", 100, 100)], 1000).size, 0);
});

check("a direct connection is the one whose chain is DIRECT", () => {
	assert.equal(routingOf(["DIRECT"]), "direct");
	assert.equal(routingOf([]), "direct");
	assert.equal(routingOf(["🇳🇱 Amsterdam", "GLOBAL"]), "proxy");
});

check("a process row totals what its connections move now and over the session", () => {
	const rates = new Map([
		["curl:a.com", { down: 1000, up: 100 }],
		["curl:b.com", { down: 500, up: 50 }],
	]);
	const groups = perProcess([tracked("a.com", "curl", ["DIRECT"], 10_000, 1_000), tracked("b.com", "curl", ["DIRECT"], 20_000, 2_000)], rates);
	assert.equal(groups.length, 1);
	assert.deepEqual(groups[0], {
		name: "curl",
		down: 1500,
		up: 150,
		downTotal: 30_000,
		upTotal: 3000,
		connections: 2,
		hosts: ["a.com", "b.com"],
		routing: "direct",
	});
});

check("one process with direct and proxied connections is mixed", () => {
	const groups = perProcess([tracked("a.com", "curl", ["DIRECT"]), tracked("b.com", "curl", ["node", "GLOBAL"])], new Map());
	assert.equal(groups[0]?.routing, "mixed");
});

check("connections without a process group under a name, not an empty row", () => {
	const groups = perProcess([tracked("a.com", "", ["DIRECT"])], new Map());
	assert.equal(groups[0]?.name, "unknown process");
});

check("the busiest process and the busiest connection come first", () => {
	const rates = new Map([
		["curl:a.com", { down: 10, up: 0 }],
		["yt-dlp:b.com", { down: 9000, up: 0 }],
	]);
	const groups = perProcess([tracked("a.com", "curl", ["DIRECT"]), tracked("b.com", "yt-dlp", ["node"])], rates);
	assert.deepEqual(
		groups.map((group) => group.name),
		["yt-dlp", "curl"],
	);
	const ordered = byRate([tracked("a.com", "curl", ["DIRECT"]), tracked("b.com", "yt-dlp", ["node"])], rates);
	assert.deepEqual(
		ordered.map((connection) => connection.host),
		["b.com", "a.com"],
	);
});

check("process mode is inserted next to the routing mode", () => {
	const config = "mixed-port: 7890\nmode: rule\nlog-level: info\n";
	assert.equal(readFindProcessMode(config), null);
	const next = withFindProcessMode(config, "always");
	assert.equal(next, "mixed-port: 7890\nmode: rule\nfind-process-mode: always\nlog-level: info\n");
	assert.equal(readFindProcessMode(next), "always");
});

check("an existing process mode is replaced in place, not duplicated", () => {
	const config = "mode: rule\nfind-process-mode: strict\n";
	const next = withFindProcessMode(config, "always");
	assert.equal(next, "mode: rule\nfind-process-mode: always\n");
	assert.equal(next.match(/find-process-mode/g)?.length, 1);
});

check("a config without a mode line still gets the key", () => {
	assert.equal(withFindProcessMode("mixed-port: 7890\n", "always"), "find-process-mode: always\nmixed-port: 7890\n");
});

console.log(checks ? `${checks} checks passed` : "no checks ran");
