/**
 * Datamuse's word relations: one endpoint, one parameter per question. The
 * spellings are the API's own (documented at datamuse.com/api) and a wrong one
 * answers an empty list instead of an error, so they are asserted in the test.
 */
export type Relation = "synonyms" | "antonyms" | "rhymes" | "sounds-like" | "adjectives" | "spelling";

const PARAM: Record<Relation, string> = {
	synonyms: "ml",
	antonyms: "rel_ant",
	rhymes: "rel_rhy",
	"sounds-like": "sl",
	adjectives: "rel_jjb",
	spelling: "sp",
};

export type RelatedWord = {
	word: string;
	/** `md=dp` asks for part of speech and definitions with every word. */
	defs?: string[];
	tags?: string[];
};

const MAX = 50;

export function relationUrl(relation: Relation, word: string): string {
	const query = new URLSearchParams({ [PARAM[relation]]: word, md: "dp", max: String(MAX) });
	return `https://api.datamuse.com/words?${query}`;
}

export async function fetchRelated(relation: Relation, word: string): Promise<RelatedWord[]> {
	const response = await fetch(relationUrl(relation, word));
	if (!response.ok) throw new Error(`Datamuse answered ${response.status} ${response.statusText}`);
	const body = (await response.json()) as unknown;
	return Array.isArray(body) ? (body as RelatedWord[]) : [];
}
