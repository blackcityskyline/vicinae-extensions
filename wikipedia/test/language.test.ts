import assert from "node:assert/strict";

import { apiBase, languageHeaders, languages } from "../src/utils/language.ts";

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

check("an ordinary language lives on its own wiki", () => {
	assert.equal(apiBase("en"), "https://en.wikipedia.org/");
	assert.equal(apiBase("ru"), "https://ru.wikipedia.org/");
	assert.equal(apiBase("be"), "https://be.wikipedia.org/");
	assert.equal(apiBase("simple"), "https://simple.wikipedia.org/");
});

check("a variant lives on the wiki of its first part", () => {
	assert.equal(apiBase("zh-hk"), "https://zh.wikipedia.org/");
	assert.equal(apiBase("zh-cn"), "https://zh.wikipedia.org/");
});

check("only a variant sends Accept-Language", () => {
	assert.deepEqual(languageHeaders("en"), {});
	assert.deepEqual(languageHeaders("zh-hk"), { "Accept-Language": "zh-hk" });
});

check("every language in the dropdown has a unique value", () => {
	const values = languages.map(({ value }) => value);
	assert.equal(new Set(values).size, values.length);
});

check("every language carries a flag and a title", () => {
	for (const { icon, title } of languages) {
		assert.ok(icon.length > 0, `no icon: ${title}`);
		assert.ok(title.length > 0, `no title: ${icon}`);
	}
});

console.log(checks ? `${checks} checks passed` : "no checks ran");
