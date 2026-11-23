import assert from "node:assert/strict";

import { parseTheme } from "../src/lib/theme.ts";
import { cardToMarkdown, CHART_H, throughputCard } from "../src/lib/cards.ts";

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

const card = (downSeries: (number | null)[], upSeries: (number | null)[] = []) =>
	throughputCard({
		iface: "wlp3s0",
		down: { current: 1024, peak: 2048, session: 0 },
		up: { current: 0, peak: 0, session: 0 },
		downSeries,
		upSeries,
		windowSeconds: 300,
	});

check("the size query sits where markdown-model.cpp splits the data URI", () => {
	// Measured: the parser reads the query only between `data:image/svg+xml`
	// and the comma that starts the payload.
	assert.ok(
		cardToMarkdown("<svg/>", CHART_H).startsWith(
			`![](data:image/svg+xml?raycast-width=420&raycast-height=${CHART_H}#x,`,
		),
	);
});

check("the drawn text is escaped, so an interface name cannot break the SVG", () => {
	const svg = throughputCard({
		iface: "w<1",
		down: { current: 0, peak: 0, session: 0 },
		up: { current: 0, peak: 0, session: 0 },
		downSeries: [],
		upSeries: [],
		windowSeconds: 300,
	});
	assert.ok(svg.includes("w&lt;1"));
	assert.ok(!svg.includes("<1\""));
});

check("an empty window says so instead of drawing a fake line", () => {
	assert.ok(card([null, null, null]).includes("collecting samples"));
	assert.ok(!card([null, null, null]).includes("<path"));
});

check("a silent window is a flat series, not an empty card", () => {
	assert.ok(card([0, 0, 0]).includes("no traffic"));
});

check("a gap between samples holds the previous value instead of dropping to zero", () => {
	// One sample for four buckets: the line has to stay at its value across the
	// rest of the window, not dive to the baseline.
	assert.ok(card([null, 5_000_000, null, null]).includes("M146.7 112 L273.3 112 L400 112"));
});

check("the theme ink is the foreground of colors.core", () => {
	assert.equal(parseTheme('[colors.core]\nforeground = "#112233"'), "#112233");
	assert.equal(parseTheme('[colors.core]\nbackground = "#112233"'), undefined);
	assert.equal(parseTheme('[colors.other]\nforeground = "#112233"'), undefined);
});

console.log(`${checks} checks passed`);
