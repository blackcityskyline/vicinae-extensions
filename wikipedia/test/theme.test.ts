import assert from "node:assert/strict";

import { parseTheme } from "../src/lib/theme.ts";

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

check("the foreground of the core colours is the card's ink", () => {
	const toml = ['[colors.core]', 'foreground = "#dcdde2"', 'background = "#111318"'].join("\n");
	assert.equal(parseTheme(toml), "#dcdde2");
});

check("a foreground outside the core section is not the ink", () => {
	const toml = ['[colors.accents]', 'foreground = "#ff0000"', '[colors.core]', 'background = "#111318"'].join("\n");
	assert.equal(parseTheme(toml), undefined);
});

check("a theme without the key answers nothing", () => {
	assert.equal(parseTheme(""), undefined);
});
