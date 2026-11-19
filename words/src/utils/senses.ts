import type { RawEntry } from "~/api/dictionary";
import type { RelatedWord } from "~/api/datamuse";

/**
 * One sense of a word: a part of speech, its definitions with an example where
 * the dictionary has one, and the words the dictionary puts beside it.
 */
export type Definition = { text: string; example?: string };

export type Sense = {
	pos: string;
	definitions: Definition[];
	synonyms: string[];
	antonyms: string[];
};

export type Entry = { word: string; phonetic?: string; senses: Sense[] };

const POS_NAMES: Record<string, string> = {
	n: "noun",
	v: "verb",
	adj: "adjective",
	adv: "adverb",
};

/** Wiktionary text sometimes carries its own links; the card draws plain text. */
function plain(text: string | undefined): string {
	return (text ?? "")
		.replace(/<[^>]*>/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

/** A definition may contain `*`, `_` or a backtick and break the markdown. */
export function escapeMarkdown(text: string): string {
	return text.replace(/([\\`*_[\]])/g, "\\$1");
}

/** The first word is not always the headword the dictionary answered with. */
export function parseEntry(entries: RawEntry[], asked: string): Entry | undefined {
	const raw = entries.find((entry) => (entry.meanings ?? []).some((meaning) => (meaning.definitions ?? []).length > 0));
	if (!raw) return undefined;

	const senses: Sense[] = [];
	for (const meaning of raw.meanings ?? []) {
		const definitions: Definition[] = [];
		const synonyms: string[] = [];
		const antonyms: string[] = [];

		for (const definition of meaning.definitions ?? []) {
			const text = plain(definition.definition);
			if (!text) continue;
			const example = plain(definition.example);
			definitions.push(example ? { text, example } : { text });
			synonyms.push(...(definition.synonyms ?? []));
			antonyms.push(...(definition.antonyms ?? []));
		}

		if (definitions.length === 0) continue;
		senses.push({
			pos: plain(meaning.partOfSpeech) || "word",
			definitions,
			synonyms: unique(synonyms),
			antonyms: unique(antonyms),
		});
	}

	if (senses.length === 0) return undefined;

	const phonetic = plain(raw.phonetic) || plain((raw.phonetics ?? []).find((item) => plain(item.text))?.text);
	const word = plain(raw.word) || plain(asked);
	return phonetic ? { word, phonetic, senses } : { word, senses };
}

/** Order matters and repeats are noise: `ephemeral` lists `short` twice. */
function unique(words: string[]): string[] {
	const seen = new Set<string>();
	const kept: string[] = [];
	for (const word of words.map((item) => plain(item)).filter((item) => item.length > 0)) {
		const key = word.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		kept.push(word);
	}
	return kept;
}

/**
 * The detail pane. Flat blocks only: Vicinae's markdown renders headings,
 * emphasis, quotes and lists, but nesting is not worth the risk, so every
 * synopsis line stands on its own.
 */
export function entryMarkdown(entry: Entry): string {
	const lines: string[] = [`# ${escapeMarkdown(entry.word)}`];
	if (entry.phonetic) lines.push(`_${escapeMarkdown(entry.phonetic)}_`);

	for (const sense of entry.senses) {
		lines.push("", `## ${escapeMarkdown(sense.pos)}`);
		sense.definitions.forEach((definition, index) => {
			lines.push("", `**${index + 1}.** ${escapeMarkdown(definition.text)}`);
			if (definition.example) lines.push(`> ${escapeMarkdown(definition.example)}`);
		});
		if (sense.synonyms.length > 0) lines.push("", `_Synonyms:_ ${sense.synonyms.map(escapeMarkdown).join(", ")}`);
		if (sense.antonyms.length > 0) lines.push("", `_Antonyms:_ ${sense.antonyms.map(escapeMarkdown).join(", ")}`);
	}

	return lines.join("\n");
}

const POS_TAGS = new Set(["n", "v", "adj", "adv"]);

/** Datamuse sends `"adj\tLasting only a short time."` per definition. */
export function parseDefinition(raw: string): { pos?: string; text: string } {
	const tab = raw.indexOf("\t");
	if (tab < 0) return { text: plain(raw) };
	const pos = raw.slice(0, tab).trim();
	return { pos: POS_NAMES[pos] ?? (pos === "" ? undefined : pos), text: plain(raw.slice(tab + 1)) };
}

/**
 * What the pane says about a related word: the dictionary definitions Datamuse
 * attaches to it, which is all there is without a second request per row.
 */
export function relatedMarkdown(word: RelatedWord): string {
	const lines: string[] = [`# ${escapeMarkdown(word.word)}`];
	const definitions = (word.defs ?? []).map(parseDefinition).filter((definition) => definition.text.length > 0);

	if (definitions.length === 0) {
		lines.push("", "_Datamuse has no definitions for this word._");
	} else {
		lines.push("");
		for (const definition of definitions) {
			lines.push(`- ${definition.pos ? `**${escapeMarkdown(definition.pos)}.** ` : ""}${escapeMarkdown(definition.text)}`);
		}
	}

	const pos = unique((word.tags ?? []).filter((tag) => POS_TAGS.has(tag))).map((tag) => POS_NAMES[tag] ?? tag);
	if (pos.length > 0) lines.push("", `_${pos.join(", ")}_`);

	return lines.join("\n");
}

export function merriamUrl(word: string): string {
	return `https://www.merriam-webster.com/dictionary/${encodeURIComponent(word)}`;
}
