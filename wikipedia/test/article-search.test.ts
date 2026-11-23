import assert from "node:assert/strict";

import { keywordsOf, previewOf } from "../src/utils/article-search.ts";

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

check("a section is searchable by its body words, once each", () => {
	const node = { title: "История", content: "Квант открыл Планк в 1900 году. Квант энергии, квант действия." };
	assert.deepEqual(keywordsOf(node), ["квант", "открыл", "планк", "1900", "году", "энергии", "действия"]);
});

check("a one- and two-letter word is noise and is dropped", () => {
	const node = { title: "Lead", content: "A quantum is a part of it, no more" };
	const words = keywordsOf(node);
	assert.equal(words.includes("a"), false);
	assert.equal(words.includes("is"), false);
	assert.ok(words.includes("quantum"));
});

check("the keywords stop at the limit instead of carrying a whole article", () => {
	const node = { title: "Long", content: Array.from({ length: 200 }, (_, index) => `word${index}`).join(" ") };
	assert.equal(keywordsOf(node, 10).length, 10);
});

check("a section preview is one line, cut at the limit with an ellipsis", () => {
	assert.equal(previewOf({ title: "A", content: "short   text\n  here" }), "short text here");
	const long = previewOf({ title: "B", content: "x".repeat(300) }, 100);
	assert.equal(long.length, 101);
	assert.ok(long.endsWith("…"));
});

console.log(checks ? `${checks} checks passed` : "no checks ran");
