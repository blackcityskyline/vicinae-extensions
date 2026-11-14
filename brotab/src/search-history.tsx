import { Action, ActionPanel, Icon, List } from "@vicinae/api";
import { useEffect, useRef, useState } from "react";

import { run, type HistoryHit } from "~/lib/cli";
import { formatMoment } from "~/lib/time";
import { NoteForm } from "~/components/note-form";
import { brotabNgBinary } from "~/lib/preferences";

/**
 * The browser's own history, searched in `places.sqlite`. The search runs in the
 * CLI, not in Vicinae's filter: ranking by last visit is the database's order and
 * a local filter would only reorder the page that came back.
 *
 * Listed with `throttle` because every keystroke is one process start, and the
 * last keystroke wins even when an earlier answer arrives after it.
 */
export default function SearchHistory() {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<HistoryHit[]>([]);
  const [isLoading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);

  useEffect(() => {
    const text = query.trim();
    const current = ++sequence.current;

    if (text === "") {
      setHits([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    run<{ hits: HistoryHit[] }>(brotabNgBinary(), ["history", text, "--limit", "50"])
      .then(({ hits }) => {
        if (current !== sequence.current) return;
        setHits(hits);
        setError(null);
      })
      .catch((failure: Error) => {
        if (current !== sequence.current) return;
        setHits([]);
        setError(failure.message);
      })
      .finally(() => {
        if (current === sequence.current) setLoading(false);
      });
  }, [query]);

  return (
    <List
      filtering={false}
      isLoading={isLoading}
      throttle
      navigationTitle="Search History"
      searchBarPlaceholder="Search visited pages"
      onSearchTextChange={setQuery}
    >
      {error !== null ? (
        <List.EmptyView icon={Icon.Warning} title="Could not search the history" description={error} />
      ) : query.trim() === "" ? (
        <List.EmptyView
          icon={Icon.MagnifyingGlass}
          title="Search your history"
          description="Type what you remember of the page title or its URL."
        />
      ) : !isLoading && hits.length === 0 ? (
        <List.EmptyView icon={Icon.MagnifyingGlass} title="No page matches" description={query.trim()} />
      ) : null}
      {hits.map((hit) => (
        <List.Item
          key={hit.url}
          title={hit.title}
          subtitle={hit.url}
          icon={Icon.Clock}
          keywords={[hit.url]}
          accessories={[
            { text: formatMoment(hit.lastVisit), tooltip: "Last visit" },
            { tag: { value: `${hit.visits}×` }, tooltip: "Visits" },
          ]}
          actions={
            <ActionPanel>
              <Action.OpenInBrowser title="Open in Browser" url={hit.url} shortcut="open" />
              <Action.CopyToClipboard title="Copy URL" content={hit.url} shortcut="copy" />
              <Action.Push title="Note" icon={Icon.Pencil} shortcut="edit" target={<NoteForm url={hit.url} />} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
