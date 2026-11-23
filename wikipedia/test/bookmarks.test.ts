import assert from "node:assert/strict";

import { BOOKMARK_LIMIT, isBookmarked, withTitle, withoutTitle } from "../src/utils/bookmarks.ts";

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

check("bookmarking puts the article first", () => {
	assert.deepEqual(withTitle(["Berlin"], "Квант"), ["Квант", "Berlin"]);
});

check("bookmarking again moves it up instead of adding a second copy", () => {
	assert.deepEqual(withTitle(["Berlin", "Квант"], "Квант"), ["Квант", "Berlin"]);
});

check("an unsaved article is not a bookmark", () => {
	assert.equal(isBookmarked(["Berlin"], "Квант"), false);
	assert.deepEqual(withoutTitle(["Berlin", "Квант"], "Квант"), ["Berlin"]);
});

check("the oldest bookmark falls off at the limit", () => {
	const titles = Array.from({ length: BOOKMARK_LIMIT }, (_, index) => `Page ${index}`);
	const next = withTitle(titles, "Newest");
	assert.equal(next.length, BOOKMARK_LIMIT);
	assert.equal(next[0], "Newest");
	assert.equal(next.includes(`Page ${BOOKMARK_LIMIT - 1}`), false);
});

console.log(checks ? `${checks} checks passed` : "no checks ran");
