import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { relationUrl } from "../src/api/datamuse.ts";
import {
	entryMarkdown,
	escapeMarkdown,
	merriamUrl,
	parseDefinition,
	parseEntry,
	relatedMarkdown,
} from "../src/utils/senses.ts";

/**
 * The fixtures are saved answers from the two services, captured 2026-11-19, so
 * the checks disagree with the code the moment it stops reading what they send.
 */
function fixture(name: string) {
	return JSON.parse(readFileSync(join(process.cwd(), "test", "fixtures", name), "utf8"));
}

let failures = 0;
function check(name: string, fn: () => void) {
	try {
		fn();
		console.log(`ok   ${name}`);
	} catch (error) {
		failures++;
		console.log(`FAIL ${name}: ${(error as Error).message}`);
	}
}

check("a real entry comes out as a headword, a phonetic and one sense per part of speech", () => {
	const entry = parseEntry(fixture("dictionary-ephemeral.json"), "ephemeral");
	assert.ok(entry);
	assert.equal(entry.word, "ephemeral");
	assert.equal(entry.phonetic, "/əˈfɛ.mə.ɹəl/");
	assert.deepEqual(
		entry.senses.map((sense) => sense.pos),
		["noun", "adjective"],
	);
	assert.equal(entry.senses[0]?.definitions[0]?.text, "Something which lasts for a short period of time.");
	assert.equal(entry.senses[0]?.definitions.length, 1);
	assert.equal(entry.senses[1]?.definitions.length, 3);
});

check("synonyms are kept in the dictionary's order and never repeat", () => {
	const entry = parseEntry(fixture("dictionary-ephemeral.json"), "ephemeral");
	assert.deepEqual(entry?.senses[1]?.synonyms.slice(0, 4), ["evanescent", "fleeting", "momentary", "short"]);
	assert.equal(new Set(entry?.senses[1]?.synonyms).size, entry?.senses[1]?.synonyms.length);
});

check("examples survive the merge, and a sense with none is still a sense", () => {
	const entry = parseEntry(fixture("dictionary-obfuscate.json"), "obfuscate");
	const definitions = entry?.senses.flatMap((sense) => sense.definitions) ?? [];
	assert.equal(
		definitions.find((definition) => definition.text.startsWith("To deliberately make more confusing"))?.example,
		"Before leaving the scene, the murderer set a fire in order to obfuscate any evidence of their identity.",
	);
	assert.equal(
		definitions.filter((definition) => definition.example !== undefined).length,
		2,
		"the fixture has exactly two examples",
	);
});

check("an entry with no definitions is not a hit", () => {
	assert.equal(parseEntry([{ word: "x", meanings: [] }], "x"), undefined);
	assert.equal(parseEntry([{ word: "x", meanings: [{ partOfSpeech: "noun", definitions: [{ definition: " " }] }] }], "x"), undefined);
});

check("the heading is escaped, so a starred definition cannot turn into emphasis", () => {
	assert.equal(escapeMarkdown("*a* [b]"), "\\*a\\* \\[b\\]");
	const markdown = entryMarkdown({
		word: "star",
		senses: [{ pos: "noun", definitions: [{ text: "a *mark*" }], synonyms: [], antonyms: [] }],
	});
	assert.match(markdown, /^# star$/m);
	assert.match(markdown, /\\\*mark\\\*/);
});

check("the pane says the same things the entry carries", () => {
	const markdown = entryMarkdown(parseEntry(fixture("dictionary-ephemeral.json"), "ephemeral")!);
	assert.match(markdown, /^## noun$/m);
	assert.match(markdown, /^## adjective$/m);
	assert.match(markdown, /^\*\*1\.\*\* Something which lasts for a short period of time\.$/m);
	assert.match(markdown, /^_Synonyms:_ ephemeron$/m);
});

check("every relation asks the parameter Datamuse documents for it", () => {
	const asked = (relation: Parameters<typeof relationUrl>[0]) => new URL(relationUrl(relation, "ephemeral")).searchParams;
	assert.equal(asked("synonyms").get("ml"), "ephemeral");
	assert.equal(asked("antonyms").get("rel_ant"), "ephemeral");
	assert.equal(asked("rhymes").get("rel_rhy"), "ephemeral");
	assert.equal(asked("sounds-like").get("sl"), "ephemeral");
	assert.equal(asked("adjectives").get("rel_jjb"), "ephemeral");
	assert.equal(asked("spelling").get("sp"), "ephemeral");
	assert.equal(asked("synonyms").get("md"), "dp", "definitions come with the words");
	assert.equal(new URL(relationUrl("rhymes", "s??a?t")).searchParams.get("rel_rhy"), "s??a?t");
});

check("a related word keeps its part of speech and drops the rest of the tag noise", () => {
	const [word] = fixture("datamuse-synonyms-ephemeral.json");
	assert.equal(word.word, "transitory");
	const markdown = relatedMarkdown(word);
	assert.match(markdown, /^# transitory$/m);
	assert.match(markdown, /^- \*\*adjective\.\*\* Lasting only a short time; temporary\.$/m);
	assert.doesNotMatch(markdown, /results_type/);
	assert.doesNotMatch(markdown, /primary_rel/);
});

check("a definition without a part of speech does not invent one", () => {
	assert.deepEqual(parseDefinition("Lasting only a short time."), { text: "Lasting only a short time." });
	assert.deepEqual(parseDefinition("adj\tLasting only a short time."), {
		pos: "adjective",
		text: "Lasting only a short time.",
	});
});

check("the Merriam-Webster article link encodes a phrase as one path segment", () => {
	assert.equal(merriamUrl("ephemeral"), "https://www.merriam-webster.com/dictionary/ephemeral");
	assert.equal(merriamUrl("de facto"), "https://www.merriam-webster.com/dictionary/de%20facto");
	assert.equal(merriamUrl("s??a?t"), "https://www.merriam-webster.com/dictionary/s%3F%3Fa%3Ft");
});

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) failed`);
if (failures > 0) process.exit(1);
