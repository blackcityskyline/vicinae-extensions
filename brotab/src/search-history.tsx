import { Action, ActionPanel, Icon, List, showToast, Toast } from "@vicinae/api";
import { useState } from "react";

import { NoteForm } from "~/components/note-form";
import ClearHistory from "~/clear-history";
import { findProfile } from "~/lib/browser";
import { deleteHistoryUrl } from "~/lib/mediator";
import { PAGE_SIZE, usePaged } from "~/lib/paging";
import { historyPage, type HistoryHit } from "~/lib/places";
import { formatMoment } from "~/lib/time";

/**
 * The browser's own history, listed newest first and searched in `places.sqlite`
 * in this process. The whole list is never loaded: each page is one query and the
 * next one is fetched when the list reaches its end.
 *
 * The search runs in SQLite, not in Vicinae's filter: the database orders by last
 * visit, and a local fuzzy pass over one page would reorder it.
 */
export default function SearchHistory() {
  const [query, setQuery] = useState("");
  const text = query.trim();

  const history = usePaged<HistoryHit>(
    async (offset) => historyPage(findProfile(), text, PAGE_SIZE, offset),
    text,
  );

  async function forget(hit: HistoryHit): Promise<void> {
    try {
      await deleteHistoryUrl(hit.url);
      history.forget((candidate) => candidate.url === hit.url);
      await showToast({ style: Toast.Style.Success, title: "Removed from history", message: hit.url });
    } catch (failure) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Could not remove it",
        message: failure instanceof Error ? failure.message : String(failure),
      });
    }
  }

  function actions(hit: HistoryHit) {
    return (
      <ActionPanel>
        <Action.OpenInBrowser title="Open in Browser" url={hit.url} shortcut="open" />
        <Action.CopyToClipboard title="Copy URL" content={hit.url} shortcut="copy" />
        <Action.Push title="Note" icon={Icon.Pencil} shortcut="edit" target={<NoteForm url={hit.url} onSaved={history.reload} />} />
        <Action
          title="Remove from History"
          icon={Icon.Trash}
          style="destructive"
          shortcut="remove"
          onAction={() => forget(hit)}
        />
        <Action title="Refresh" icon={Icon.ArrowClockwise} shortcut="refresh" onAction={history.reload} />
        <Action.Push title="Clear History…" icon={Icon.DeleteDocument} shortcut="remove-all" target={<ClearHistory />} />
      </ActionPanel>
    );
  }

  return (
    <List
      filtering={false}
      isLoading={history.isLoading}
      throttle
      navigationTitle="History"
      searchBarPlaceholder="Search visited pages"
      onSearchTextChange={setQuery}
      pagination={{ hasMore: history.hasMore, onLoadMore: history.loadMore }}
    >
      {history.error !== null ? (
        <List.EmptyView
          icon={Icon.Warning}
          title="Could not read the history"
          description={history.error}
          actions={
            <ActionPanel>
              <Action title="Refresh" icon={Icon.ArrowClockwise} shortcut="refresh" onAction={history.reload} />
            </ActionPanel>
          }
        />
      ) : !history.isLoading && history.items.length === 0 ? (
        <List.EmptyView
          icon={Icon.MagnifyingGlass}
          title={text === "" ? "No history" : "No page matches"}
          description={text === "" ? "The browser has not recorded a visit yet." : text}
        />
      ) : null}
      {history.items.map((hit) => (
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
          actions={actions(hit)}
        />
      ))}
    </List>
  );
}
