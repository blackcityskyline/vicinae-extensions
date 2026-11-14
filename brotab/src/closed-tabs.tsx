import { Action, ActionPanel, Icon, List } from "@vicinae/api";

import { NoteForm } from "~/components/note-form";
import { run, type ClosedTab } from "~/lib/cli";
import { PAGE_SIZE, usePaged } from "~/lib/paging";
import { brotabNgBinary } from "~/lib/preferences";
import { formatMoment } from "~/lib/time";

/**
 * What the browser still remembers of recently closed tabs, from its session
 * store. Opening one is the closest thing to the browser's own undo without
 * being inside it. The session keeps a bounded list, so there is nothing to
 * search: the pages come from the same file each time.
 */
export default function ClosedTabs() {
  const binary = brotabNgBinary();

  const closed = usePaged<ClosedTab>(
    (offset) =>
      run<{ closed: ClosedTab[]; hasMore: boolean }>(binary, [
        "closed",
        "--limit",
        String(PAGE_SIZE),
        "--offset",
        String(offset),
      ]).then(({ closed: rows, hasMore }) => ({ items: rows, hasMore })),
    "",
  );

  return (
    <List
      isLoading={closed.isLoading}
      navigationTitle="Recently Closed Tabs"
      searchBarPlaceholder="Search closed tabs"
      pagination={{ hasMore: closed.hasMore, onLoadMore: closed.loadMore }}
    >
      {closed.error !== null ? (
        <List.EmptyView
          icon={Icon.Warning}
          title="Could not read the session store"
          description={closed.error}
          actions={
            <ActionPanel>
              <Action title="Refresh" icon={Icon.ArrowClockwise} shortcut="refresh" onAction={closed.reload} />
            </ActionPanel>
          }
        />
      ) : !closed.isLoading && closed.items.length === 0 ? (
        <List.EmptyView
          icon={Icon.Undo}
          title="No recently closed tabs"
          description="The browser has not closed a tab since it started."
        />
      ) : null}
      {closed.items.map((tab) => (
        <List.Item
          key={`${tab.closedAt}-${tab.url}`}
          title={tab.title}
          subtitle={tab.url}
          icon={Icon.Undo}
          keywords={[tab.url]}
          accessories={[{ text: formatMoment(tab.closedAt), tooltip: "Closed" }]}
          actions={
            <ActionPanel>
              <Action.OpenInBrowser title="Open in Browser" url={tab.url} shortcut="open" />
              <Action.CopyToClipboard title="Copy URL" content={tab.url} shortcut="copy" />
              <Action.Push
                title="Note"
                icon={Icon.Pencil}
                shortcut="edit"
                target={<NoteForm url={tab.url} onSaved={closed.reload} />}
              />
              <Action title="Refresh" icon={Icon.ArrowClockwise} shortcut="refresh" onAction={closed.reload} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
