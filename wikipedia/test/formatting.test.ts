import assert from "node:assert/strict";

import {
	escapeRegExp,
	formatDate,
	formatMetadataValue,
	formatSize,
	isEchoedLabel,
	isScaffoldingKey,
	isScaffoldingValue,
	processMetadata,
	renderContent,
	replaceLinks,
	toSentenceCase,
	toTitleCase,
} from "../src/utils/formatting.ts";
import type { WikiNode } from "../src/utils/api.ts";

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

check("a metadata key reads as words", () => {
	assert.equal(toTitleCase("birthDate"), "Birth Date");
	assert.equal(toTitleCase("coordinates"), "Coordinates");
});

check("only the first letter of a description is uppercased", () => {
	assert.equal(toSentenceCase("city in Germany"), "City in Germany");
	assert.equal(toSentenceCase("Évora"), "Évora");
});

check("a regex is escaped, a dot is not a wildcard", () => {
	const pattern = new RegExp(`^${escapeRegExp("A.C (film)")}$`);
	assert.ok(pattern.test("A.C (film)"));
	assert.equal(pattern.test("ABC (film)"), false);
});

check("a link in the text becomes a markdown link to the article in the launcher", () => {
	const text = "Berlin is the capital of Germany.";
	assert.equal(
		replaceLinks(text, "en", ["Germany"], false),
		"Berlin is the capital of [Germany](vicinae://launch/@black/wikipedia/open-page?fallbackText=Germany).",
	);
});

check("the same link points at wikipedia when pages open in the browser", () => {
	assert.equal(
		replaceLinks("See Germany.", "de", ["Germany"], true),
		"See [Germany](https://de.wikipedia.org/wiki/Germany).",
	);
});

check("a title with a slash or a space survives the round trip", () => {
	const link = replaceLinks("Read AC/DC and New York.", "en", ["AC/DC", "New York"], true);
	assert.ok(link.includes("(https://en.wikipedia.org/wiki/AC%2FDC)"));
	assert.ok(link.includes("(https://en.wikipedia.org/wiki/New%20York)"));
});

check("no links leaves the text untouched instead of bracketing every word", () => {
	const text = "Nothing to link here.";
	assert.equal(replaceLinks(text, "en", [], true), text);
	assert.equal(replaceLinks(text, "en", [], false), text);
});

check("a section is a heading, its body and its nested sections one level down", () => {
	const nodes: WikiNode[] = [
		{
			title: "History",
			content: "It began.",
			items: [{ title: "Early", content: "Very early." }],
		},
	];
	assert.equal(renderContent(nodes, 2), "## History\n\nIt began.\n\n### Early\n\nVery early.\n\n");
});

check("the excluded sections are dropped, whatever the language", () => {
	const nodes: WikiNode[] = [
		{ title: "History", content: "Kept." },
		{ title: "References", content: "Dropped." },
		{ title: "Примечания", content: "Dropped too." },
		{ title: "Bibliografia", content: "Dropped as well." },
		{ title: "Notlar", content: "And this." },
	];
	const body = renderContent(nodes, 2);
	assert.ok(body.includes("History"));
	assert.equal(body.includes("References"), false);
	assert.equal(body.includes("Примечания"), false);
	assert.equal(body.includes("Bibliografia"), false);
	assert.equal(body.includes("Notlar"), false);
});

check("an empty section is dropped", () => {
	assert.equal(renderContent([{ title: "History", content: "" }], 2), "");
});

check("nested sections follow the link preference too", () => {
	const nodes: WikiNode[] = [{ title: "History", content: "", items: [{ title: "Early", content: "See Germany." }] }];
	const body = renderContent(nodes, 2, ["Germany"], "en", true);
	assert.ok(body.includes("https://en.wikipedia.org/wiki/Germany"));
});

check("metadata loses the fields that mean nothing to a reader", () => {
	const metadata = processMetadata({
		image: "Flag.svg",
		cat: "wikitext",
		"1": "positional",
		flag: "true",
		height: "altura",
		birthDate: "1900",
	});
	assert.deepEqual(
		metadata.map(({ key }) => key),
		["birthDate"],
	);
});

check("metadata keeps a value the filters do not name", () => {
	const metadata = processMetadata({ population: "3,600,000" });
	assert.deepEqual(metadata, [{ key: "population", title: "Population", value: "3,600,000" }]);
});

check("coordinates lose their precision and altitude", () => {
	assert.equal(formatMetadataValue("coordinates", "52|31|12|N|13|24|36|E|34"), "52, 31");
});

check("an empty metadata value is N/A, not blank", () => {
	assert.equal(formatMetadataValue("population", ""), "N/A");
	assert.equal(formatMetadataValue("population", undefined), "N/A");
});

check("a template's text!link pair reads as its text", () => {
	assert.equal(formatMetadataValue("вид региона", "Земли Германии!Земля"), "Земли Германии");
});

check("an article's size reads in the unit that fits", () => {
	assert.equal(formatSize(512), "512 B");
	assert.equal(formatSize(96_048), "94 KB");
	assert.equal(formatSize(3 * 1024 * 1024), "3.0 MB");
});

check("a timestamp reads as a date in the article's language", () => {
	assert.match(formatDate("2026-11-22T12:00:00Z", "en"), /Nov 2[12], 2026/);
	assert.match(formatDate("2026-11-22T12:00:00Z", "ru"), /2026/);
	assert.equal(formatDate("not a date", "en"), "not a date");
});

check("an infobox's layout slots never reach the metadata bar", () => {
	assert.ok(isScaffoldingKey("photo1a"));
	assert.ok(isScaffoldingKey("colorBorder"));
	assert.ok(isScaffoldingKey("spacing"));
	assert.ok(!isScaffoldingKey("население"), "a fact is not scaffolding");
	assert.ok(isScaffoldingValue("#e6e7ea"));
	assert.ok(isScaffoldingValue("12px"));
	assert.ok(!isScaffoldingValue("3 700 000"));
});

check("a Russian infobox's image slots are scaffolding too", () => {
	// Measured on Берлин: these keys arrive from the article's own template.
	for (const key of ["изображение", "описание изображения", "ширина герба", "карта страны", "size"]) {
		assert.ok(isScaffoldingKey(key), `${key} is layout, not a fact`);
	}
	assert.ok(!isScaffoldingKey("площадь"), "area is a fact");
	assert.ok(isEchoedLabel("население", " Население "), "a label echoed as its value says nothing");
});

check("the metadata bar keeps the facts and drops the scaffolding", () => {
	const metadata = processMetadata({
		статус: "город",
		photo1a: "Berlin.jpg",
		color: "#abcdef",
		население: "3 700 000",
	});
	assert.deepEqual(
		metadata.map(({ title }) => title),
		["Статус", "Население"],
	);
});

console.log(checks ? `${checks} checks passed` : "no checks ran");
