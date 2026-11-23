import assert from "node:assert/strict";

import { cleanSnippet, factsFor, readFacts, readSearch, tidySnippet } from "../src/utils/search.ts";

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

check("a snippet keeps the words and loses the match markup", () => {
	assert.equal(cleanSnippet('The <span class="searchmatch">Quantum</span>  theory'), "The Quantum theory");
});

check("entities become the characters they stand for", () => {
	assert.equal(cleanSnippet("&quot;A&amp;B&quot; &#039;c&#039; &#x41;"), '"A&B" \'c\' A');
});

check("an unknown entity is left as written", () => {
	assert.equal(cleanSnippet("a &bogus; b"), "a &bogus; b");
});

check("a snippet cut mid-word ends at the word", () => {
	// Measured: ru.wikipedia cuts "... двадцать второй фильм из серии фильмов EON Productions об".
	const cut = "«Квант милосердия» — двадцать второй фильм из серии фильмов EON Productions об";
	assert.equal(tidySnippet(cut), "«Квант милосердия» — двадцать второй фильм из серии фильмов EON Productions…");
});

check("a snippet that already ends a sentence is left alone", () => {
	assert.equal(tidySnippet("Квант — часть величины в физике."), "Квант — часть величины в физике.");
});

check("a search answer keeps the snippet, the word count and the suggestion", () => {
	const answer = readSearch({
		query: {
			search: [{ pageid: 7, title: "Quantum mechanics", snippet: "a <span>b</span>", wordcount: 42 }],
			searchinfo: { suggestion: " quantum mechanics " },
		},
	});
	assert.deepEqual(answer.results, [{ pageid: 7, title: "Quantum mechanics", snippet: "a b…", words: 42 }]);
	assert.equal(answer.suggestion, "quantum mechanics");
});

check("an empty suggestion is no suggestion", () => {
	assert.equal(readSearch({ query: { search: [], searchinfo: { suggestion: "  " } } }).suggestion, undefined);
	assert.deepEqual(readSearch({}).results, []);
});

check("facts skip the pages that do not exist", () => {
	const facts = readFacts({
		query: {
			pages: [
				{ title: "Missing", missing: true },
				{ title: "Berlin", description: " Capital of Germany ", thumbnail: { source: "https://x/b.jpg" } },
				{ title: "Nothing" },
			],
		},
	});
	assert.deepEqual(Object.keys(facts), ["Berlin"]);
	assert.deepEqual(facts.Berlin, { description: "Capital of Germany", thumbnail: "https://x/b.jpg" });
});

check("the API's normalized title answers as well as the one asked for", () => {
	const facts = readFacts({
		query: {
			normalized: [{ from: "berlin", to: "Berlin" }],
			pages: [{ title: "Berlin", description: "Capital of Germany" }],
		},
	});
	assert.deepEqual(factsFor(facts, "berlin"), { description: "Capital of Germany" });
	assert.deepEqual(factsFor(facts, "BERLIN"), { description: "Capital of Germany" });
	assert.equal(factsFor(facts, "Paris"), undefined);
});
