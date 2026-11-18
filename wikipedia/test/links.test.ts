import assert from "node:assert/strict";

import { reduceHistory, type HistoryState } from "../src/utils/history.ts";
import { browserPageLink, browserSearchLink, launcherPageLink, pageLink } from "../src/utils/links.ts";

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

const start: HistoryState = { entries: [{ title: "Berlin", language: "en" }], index: 0 };

check("going back from the first article stays there", () => {
	assert.equal(reduceHistory(start, { type: "back" }), start);
});

check("going forward from the last article stays there", () => {
	assert.deepEqual(reduceHistory(start, { type: "forward" }), start);
});

check("navigating appends and moves the cursor", () => {
	const next = reduceHistory(start, { type: "navigate", title: "Germany", language: "de" });
	assert.deepEqual(next.entries, [
		{ title: "Berlin", language: "en" },
		{ title: "Germany", language: "de" },
	]);
	assert.equal(next.index, 1);
});

check("back and forward move the cursor without touching the entries", () => {
	const two = reduceHistory(start, { type: "navigate", title: "Germany", language: "en" });
	const back = reduceHistory(two, { type: "back" });
	assert.equal(back.index, 0);
	assert.equal(back.entries.length, 2);
	assert.equal(reduceHistory(back, { type: "forward" }).index, 1);
});

check("navigating after a step back drops the abandoned tail", () => {
	const two = reduceHistory(start, { type: "navigate", title: "Germany", language: "en" });
	const back = reduceHistory(two, { type: "back" });
	const next = reduceHistory(back, { type: "navigate", title: "Prussia", language: "en" });
	assert.deepEqual(
		next.entries.map(({ title }) => title),
		["Berlin", "Prussia"],
	);
	assert.equal(next.index, 1);
});

check("an article link in the launcher is a deeplink to the open-page command", () => {
	assert.equal(
		launcherPageLink("New York"),
		"vicinae://launch/@black/wikipedia/open-page?fallbackText=New%20York",
	);
});

check("an article link in the browser is the wikipedia article", () => {
	assert.equal(browserPageLink("AC/DC", "en"), "https://en.wikipedia.org/wiki/AC%2FDC");
	assert.equal(browserPageLink("Київ", "uk"), "https://uk.wikipedia.org/wiki/%D0%9A%D0%B8%D1%97%D0%B2");
});

check("the link target follows the Open In preference", () => {
	assert.equal(pageLink("Berlin", "en", true), "https://en.wikipedia.org/wiki/Berlin");
	assert.ok(pageLink("Berlin", "en", false).startsWith("vicinae://"));
});

check("a search in the browser is the advanced full-text search", () => {
	const url = new URL(browserSearchLink("black hole", "en"));
	assert.equal(url.hostname, "en.wikipedia.org");
	assert.equal(url.searchParams.get("search"), "black hole");
	assert.equal(url.searchParams.get("title"), "Special:Search");
	assert.equal(url.searchParams.get("fulltext"), "1");
	assert.equal(url.searchParams.get("ns0"), "1");
});

console.log(checks ? `${checks} checks passed` : "no checks ran");
