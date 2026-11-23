/**
 * What `list=search` and `prop=pageimages|description` answer, turned into rows.
 * Pure: no fetch, no React, so the self-checks can call it with a recorded body.
 */

export type FoundPage = {
	pageid: number;
	title: string;
	/** The matched words as plain text: the API sends them with `<span>` and entities. */
	snippet: string;
	words?: number;
};

export type PageFacts = {
	description?: string;
	thumbnail?: string;
};

export type SearchAnswer = {
	results: FoundPage[];
	/** The search engine's own spelling fix, when it has one. */
	suggestion?: string;
};

export interface WireSearch {
	query?: {
		search?: { pageid: number; title: string; snippet?: string; wordcount?: number }[];
		searchinfo?: { suggestion?: string };
	};
}

export interface WireFacts {
	query?: {
		normalized?: { from: string; to: string }[];
		pages?: {
			title?: string;
			missing?: boolean;
			description?: string;
			thumbnail?: { source?: string };
		}[];
	};
}

const entities: Record<string, string> = {
	amp: "&",
	apos: "'",
	gt: ">",
	lt: "<",
	nbsp: " ",
	quot: '"',
};

/** `&amp;` and friends, without pulling in an HTML parser for five of them. */
function decode(whole: string, name: string): string {
	if (name.startsWith("#")) {
		const code = name.startsWith("#x") || name.startsWith("#X") ? Number.parseInt(name.slice(2), 16) : Number.parseInt(name.slice(1), 10);
		if (Number.isFinite(code) && code > 0 && code <= 0x10ffff) return String.fromCodePoint(code);
		return whole;
	}
	return entities[name.toLowerCase()] ?? whole;
}

/** The match highlights are `<span class="searchmatch">` around words; a row wants the words. */
export function cleanSnippet(html: string): string {
	return html
		.replace(/<[^>]*>/g, "")
		.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, decode)
		.replace(/\s+/g, " ")
		.trim();
}

/**
 * The engine cuts a snippet at a fixed length, often mid-word ("…фильм об"): end
 * it at the last whole word and say that something follows.
 */
export function tidySnippet(text: string): string {
	const clean = text.replace(/\s+/g, " ").trim();
	if (!clean || /[.!?;:,…»)"']$/.test(clean)) return clean;
	const wholeWords = clean.replace(/\s+\S+$/, "");
	// A snippet short enough that cutting would leave nothing keeps its last word.
	return `${wholeWords.length >= 40 ? wholeWords : clean}…`;
}

export function readSearch(answer: WireSearch): SearchAnswer {
	const results = (answer.query?.search ?? []).map((result) => ({
		pageid: result.pageid,
		title: result.title,
		snippet: tidySnippet(cleanSnippet(result.snippet ?? "")),
		...(result.wordcount === undefined ? {} : { words: result.wordcount }),
	}));
	const suggestion = answer.query?.searchinfo?.suggestion?.trim();
	return { results, suggestion: suggestion ? suggestion : undefined };
}

/**
 * The facts of a batch of titles, keyed by title. `normalized` is the API's own
 * rename (an uncapitalized query, an underscore), so both spellings answer.
 */
export function readFacts(answer: WireFacts): Record<string, PageFacts> {
	const facts: Record<string, PageFacts> = {};
	for (const page of answer.query?.pages ?? []) {
		if (!page.title || page.missing) continue;
		const thumbnail = page.thumbnail?.source;
		const description = page.description?.trim();
		if (!thumbnail && !description) continue;
		facts[page.title] = {
			...(description ? { description } : {}),
			...(thumbnail ? { thumbnail } : {}),
		};
	}
	for (const { from, to } of answer.query?.normalized ?? []) {
		if (facts[to]) facts[from] = facts[to] as PageFacts;
	}
	return facts;
}

/** Exact title first, then the case-insensitive match the API's normalization left behind. */
export function factsFor(facts: Record<string, PageFacts>, title: string): PageFacts | undefined {
	const exact = facts[title];
	if (exact) return exact;
	const wanted = title.toLowerCase();
	for (const [key, value] of Object.entries(facts)) {
		if (key.toLowerCase() === wanted) return value;
	}
	return undefined;
}
