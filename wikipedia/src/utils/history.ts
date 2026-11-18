import type { Locale } from "~/utils/language";

export type HistoryEntry = { title: string; language: Locale };

export type HistoryState = {
	entries: HistoryEntry[];
	index: number;
};

export type HistoryAction = { type: "back" } | { type: "forward" } | { type: "navigate"; title: string; language: Locale };

/**
 * The reader keeps its own stack because the navigation stack cannot be rewritten
 * in place: going back to an article you have already visited must not push a
 * duplicate, and navigating after a step back drops the abandoned tail.
 */
export function reduceHistory(state: HistoryState, action: HistoryAction): HistoryState {
	switch (action.type) {
		case "back":
			if (state.index === 0) return state;
			return { ...state, index: state.index - 1 };
		case "forward":
			if (state.index >= state.entries.length - 1) return state;
			return { ...state, index: state.index + 1 };
		case "navigate":
			return {
				entries: [...state.entries.slice(0, state.index + 1), { title: action.title, language: action.language }],
				index: state.index + 1,
			};
	}
}
