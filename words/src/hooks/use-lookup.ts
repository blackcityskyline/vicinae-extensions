import { useEffect, useState } from "react";

import { lookUp } from "~/api/dictionary";
import { fetchRelated, type RelatedWord, type Relation } from "~/api/datamuse";
import { fetchSlang, type RawSlang } from "~/api/urban";
import { parseEntry, type Entry } from "~/utils/senses";
import { parseSlang, type Slang } from "~/utils/slang";

/** What the screen asks for: the dictionary's entry, urban slang, or one relation. */
export type Source = Relation | "slang";

export type LookupState = {
	entry?: Entry;
	related: RelatedWord[];
	slang: Slang[];
	isLoading: boolean;
	error?: string;
};

const EMPTY: LookupState = { related: [], slang: [], isLoading: false };
const DEBOUNCE_MS = 250;

/**
 * The word's entry and the words beside it, asked together so one keystroke
 * costs one round trip. The meaning mode asks for synonyms: the definitions
 * alone leave the pane without the words the user came to compare. The slang
 * mode asks Urban Dictionary instead, which shares nothing with the others.
 */
export function useLookup(query: string, source: Source): LookupState {
	const [state, setState] = useState<LookupState>(EMPTY);

	useEffect(() => {
		const word = query.trim();
		if (word === "") {
			setState(EMPTY);
			return;
		}

		let active = true;
		setState((previous) => ({ ...previous, isLoading: true, error: undefined }));

		const timer = setTimeout(async () => {
			try {
				if (source === "slang") {
					const entries: RawSlang[] = await fetchSlang(word);
					if (!active) return;
					setState({ related: [], slang: parseSlang(entries, word), isLoading: false });
					return;
				}

				const [lookup, related] = await Promise.all([lookUp(word), fetchRelated(source, word)]);
				if (!active) return;

				const entry = lookup.status === "found" ? parseEntry(lookup.entries, word) : undefined;
				setState({ entry, related, slang: [], isLoading: false });
			} catch (error) {
				if (!active) return;
				const reason = error instanceof Error ? error.message : String(error);
				setState({ related: [], slang: [], isLoading: false, error: reason });
			}
		}, DEBOUNCE_MS);

		return () => {
			active = false;
			clearTimeout(timer);
		};
	}, [query, source]);

	return state;
}
