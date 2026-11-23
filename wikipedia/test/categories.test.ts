import assert from "node:assert/strict";

import { readCategories, readCategoryMembers, stripNamespace } from "../src/utils/categories.ts";

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

check("a category shows its name without the localized namespace", () => {
	// Measured on ru.wikipedia: the API answers "Категория:Квантовая физика".
	assert.equal(stripNamespace("Категория:Квантовая физика"), "Квантовая физика");
	assert.equal(stripNamespace("Category:Physics"), "Physics");
	assert.equal(stripNamespace("Физика"), "Физика");
});

check("a category list keeps the named categories and drops the empty slots", () => {
	const categories = readCategories({
		query: { pages: [{ categories: [{ ns: 14, title: "Категория:Кванты" }, { ns: 14 }, { title: " " }] }] },
	});
	assert.deepEqual(categories, ["Категория:Кванты"]);
});

check("a category lists only articles, not its files and subcategories", () => {
	const members = readCategoryMembers({
		query: {
			categorymembers: [
				{ ns: 0, title: "3j-Символ" },
				{ ns: 6, title: "Файл:Квант.png" },
				{ ns: 0, title: "Адиабатическая теорема" },
				{ ns: 14, title: "Категория:Подкатегория" },
			],
		},
	});
	assert.deepEqual(members, ["3j-Символ", "Адиабатическая теорема"]);
});

console.log(checks ? `${checks} checks passed` : "no checks ran");
