import { useEffect, useState } from "react";

import { lookUp } from "~/api/dictionary";
import { fetchRelated, type RelatedWord, type Relation } from "~/api/datamuse";
import { parseEntry, type Entry } from "~/utils/senses";

export type LookupState = {
	entry?: Entry;
	related: RelatedWord[];
	isLoading: boolean;
	error?: string;
};

const EMPTY: LookupState = { related: [], isLoading: false };
const DEBOUNCE_MS = 250;

/**
 * The word's entry and the words beside it, asked together so one keystroke
 * costs one round trip. The meaning mode asks for synonyms: the definitions
 * alone leave the pane without the words the user came to compare.
 */
export function useLookup(query: string, relation: Relation): LookupState {
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
				const [lookup, related] = await Promise.all([lookUp(word), fetchRelated(relation, word)]);
				if (!active) return;

				const entry = lookup.status === "found" ? parseEntry(lookup.entries, word) : undefined;
				setState({ entry, related, isLoading: false });
			} catch (error) {
				if (!active) return;
				const reason = error instanceof Error ? error.message : String(error);
				setState({ related: [], isLoading: false, error: reason });
			}
		}, DEBOUNCE_MS);

		return () => {
			active = false;
			clearTimeout(timer);
		};
	}, [query, relation]);

	return state;
}
