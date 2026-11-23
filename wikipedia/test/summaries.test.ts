import assert from "node:assert/strict";

import { SUMMARY_LIMIT, storeSummary, summaryOf, type SummaryIndex } from "../src/utils/summaries.ts";

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

check("a read article keeps its cover and description", () => {
	const index = storeSummary(undefined, { title: "Berlin", description: "Capital", thumbnail: "https://x/b.jpg", at: 1 });
	assert.deepEqual(summaryOf(index, "Berlin"), { title: "Berlin", description: "Capital", thumbnail: "https://x/b.jpg", at: 1 });
	assert.equal(summaryOf(index, "Paris"), undefined);
});

check("reading the same article again replaces its entry", () => {
	const first = storeSummary(undefined, { title: "Berlin", at: 1 });
	const second = storeSummary(first, { title: "Berlin", description: "Capital", at: 2 });
	assert.equal(Object.keys(second).length, 1);
	assert.equal(summaryOf(second, "Berlin")?.at, 2);
});

check("the index keeps the newest entries and drops the oldest", () => {
	let index: SummaryIndex | undefined;
	for (let at = 1; at <= SUMMARY_LIMIT + 5; at++) index = storeSummary(index, { title: `Article ${at}`, at });
	assert.equal(Object.keys(index ?? {}).length, SUMMARY_LIMIT);
	assert.equal(summaryOf(index, "Article 1"), undefined, "the oldest is the one that goes");
	assert.equal(summaryOf(index, `Article ${SUMMARY_LIMIT + 5}`)?.title, `Article ${SUMMARY_LIMIT + 5}`);
});
