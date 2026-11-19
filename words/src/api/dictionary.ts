/**
 * An entry of a free dictionary, as dictionaryapi.dev returns it: Wiktionary
 * senses grouped by part of speech. The response is not validated beyond the
 * fields the cards read, so every one of them is optional here.
 */
export type RawDefinition = {
	definition?: string;
	example?: string;
	synonyms?: string[];
	antonyms?: string[];
};

export type RawMeaning = {
	partOfSpeech?: string;
	definitions?: RawDefinition[];
};

export type RawEntry = {
	word?: string;
	phonetic?: string;
	phonetics?: { text?: string }[];
	meanings?: RawMeaning[];
};

export type Lookup =
	| { status: "found"; entries: RawEntry[] }
	/** The dictionary knows no such headword: an inflection, a name, a typo. */
	| { status: "missing" };

export async function lookUp(word: string): Promise<Lookup> {
	const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
	if (response.status === 404) return { status: "missing" };
	if (!response.ok) throw new Error(`The dictionary answered ${response.status} ${response.statusText}`);

	const body = (await response.json()) as unknown;
	if (!Array.isArray(body) || body.length === 0) return { status: "missing" };
	return { status: "found", entries: body as RawEntry[] };
}
