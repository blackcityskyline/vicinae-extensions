import { Action, ActionPanel, Icon, List, type LaunchProps } from "@vicinae/api";
import { useState } from "react";

import type { Relation } from "~/api/datamuse";
import { useLookup } from "~/hooks/use-lookup";
import { entryMarkdown, merriamUrl, parseDefinition, relatedMarkdown } from "~/utils/senses";

type Mode = "meaning" | Relation;

const MODES: { value: Mode; title: string }[] = [
	{ value: "meaning", title: "Meaning" },
	{ value: "synonyms", title: "Synonyms" },
	{ value: "antonyms", title: "Antonyms" },
	{ value: "rhymes", title: "Rhymes" },
	{ value: "sounds-like", title: "Sounds Like" },
	{ value: "adjectives", title: "Adjectives" },
	{ value: "spelling", title: "Spelling" },
];

/** A row's actions: the word itself, wherever it came from. */
function WordActions({ word, onLookUp }: { word: string; onLookUp?: () => void }) {
	return (
		<ActionPanel>
			{onLookUp ? <Action title="Look Up" icon={Icon.MagnifyingGlass} onAction={onLookUp} /> : null}
			<Action.CopyToClipboard title="Copy Word" content={word} shortcut="copy" />
			<Action.Paste title="Paste Word" content={word} shortcut="paste" />
			<Action.OpenInBrowser title="Open on Merriam-Webster" url={merriamUrl(word)} shortcut="open" />
		</ActionPanel>
	);
}

function ModeDropdown({ mode, onChange }: { mode: Mode; onChange: (mode: Mode) => void }) {
	return (
		<List.Dropdown tooltip="What to look up" value={mode} storeValue onChange={(value) => onChange(value as Mode)}>
			{MODES.map((item) => (
				<List.Dropdown.Item key={item.value} title={item.title} value={item.value} />
			))}
		</List.Dropdown>
	);
}

export default function LookUpCommand(props: LaunchProps) {
	// A deeplink carries the word: `vicinae://launch/@black/words/lookup?fallbackText=ephemeral`.
	const [query, setQuery] = useState(props.fallbackText ?? "");
	const [mode, setMode] = useState<Mode>("meaning");
	const relation: Relation = mode === "meaning" ? "synonyms" : mode;
	const { entry, related, isLoading, error } = useLookup(query, relation);

	const word = query.trim();
	const section = mode === "meaning" ? "Synonyms" : MODES.find((item) => item.value === mode)?.title ?? "";
	const hasContent = entry !== undefined || related.length > 0;
	const showEmpty = error !== undefined || !hasContent;

	return (
		<List
			isLoading={isLoading}
			isShowingDetail={!showEmpty}
			searchText={query}
			onSearchTextChange={setQuery}
			searchBarPlaceholder={mode === "spelling" ? "e.g. s??a?t or *he*o" : "Type a word"}
			searchBarAccessory={<ModeDropdown mode={mode} onChange={setMode} />}
			throttle
		>
			{showEmpty ? (
				<List.EmptyView
					icon={Icon.Book}
					title={error ? "The lookup failed" : word === "" ? "Look up a word" : `No entry for “${word}”`}
					description={
						error ??
						(word === ""
							? "Meaning shows definitions with examples from Wiktionary; the other modes list the words beside the one you type."
							: "Wiktionary has no headword by that name — it may be a name, an inflection or a typo. The Spelling mode matches unknown letters with ? or *.")
					}
				/>
			) : null}

			{entry ? (
				<List.Item
					id={entry.word}
					title={entry.word}
					subtitle={entry.phonetic}
					detail={<List.Item.Detail markdown={entryMarkdown(entry)} />}
					actions={<WordActions word={entry.word} />}
				/>
			) : null}

			{related.length > 0 ? (
				<List.Section title={section}>
					{related.map((item) => (
						<List.Item
							key={`${section}:${item.word}`}
							title={item.word}
							subtitle={item.defs?.[0] ? parseDefinition(item.defs[0]).text : undefined}
							keywords={[item.word]}
							detail={<List.Item.Detail markdown={relatedMarkdown(item)} />}
							actions={<WordActions word={item.word} onLookUp={() => setQuery(item.word)} />}
						/>
					))}
				</List.Section>
			) : null}
		</List>
	);
}
