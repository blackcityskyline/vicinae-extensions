import assert from "node:assert/strict";

import { citationOf } from "../src/utils/citation.ts";

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

check("a citation names the article, the encyclopedia, the dates and the URL", () => {
	const citation = citationOf({
		title: "Квант",
		url: "https://ru.wikipedia.org/wiki/%D0%9A%D0%B2%D0%B0%D0%BD%D1%82",
		edited: "22 нояб. 2026 г.",
		retrieved: "23 нояб. 2026 г.",
	});
	assert.equal(
		citation,
		'"Квант." Wikipedia, The Free Encyclopedia. Last edited 22 нояб. 2026 г. Retrieved 23 нояб. 2026 г., from https://ru.wikipedia.org/wiki/%D0%9A%D0%B2%D0%B0%D0%BD%D1%82',
	);
});

check("without a known edit date the citation still reads as a sentence", () => {
	const citation = citationOf({ title: "Berlin", url: "https://en.wikipedia.org/wiki/Berlin", retrieved: "Nov 23, 2026" });
	assert.equal(citation, '"Berlin." Wikipedia, The Free Encyclopedia. Retrieved Nov 23, 2026, from https://en.wikipedia.org/wiki/Berlin');
});

console.log(checks ? `${checks} checks passed` : "no checks ran");
