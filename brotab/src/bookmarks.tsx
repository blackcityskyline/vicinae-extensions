import { Action, ActionPanel, Icon, List } from "@vicinae/api";
import { useState } from "react";

import { NoteForm } from "~/components/note-form";
import { run, type Bookmark } from "~/lib/cli";
import { PAGE_SIZE, usePaged } from "~/lib/paging";
import { brotabNgBinary } from "~/lib/preferences";
import { formatMoment } from "~/lib/time";

/** The browser's bookmarks, with the folder each one lives in. */
export default function Bookmarks() {
  const [query, setQuery] = useState("");
  const text = query.trim();
  const binary = brotabNgBinary();

  const bookmarks = usePaged<Bookmark>(
    (offset) =>
      run<{ bookmarks: Bookmark[]; hasMore: boolean }>(binary, [
        "bookmarks",
        text,
        "--limit",
        String(PAGE_SIZE),
        "--offset",
        String(offset),
      ]).then(({ bookmarks: rows, hasMore }) => ({ items: rows, hasMore })),
    text,
  );

  return (
    <List
      filtering={false}
      isLoading={bookmarks.isLoading}
      throttle
      navigationTitle="Bookmarks"
      searchBarPlaceholder="Search bookmarks"
      onSearchTextChange={setQuery}
      pagination={{ hasMore: bookmarks.hasMore, onLoadMore: bookmarks.loadMore }}
    >
      {bookmarks.error !== null ? (
        <List.EmptyView
          icon={Icon.Warning}
          title="Could not read the bookmarks"
          description={bookmarks.error}
          actions={
            <ActionPanel>
              <Action title="Refresh" icon={Icon.ArrowClockwise} shortcut="refresh" onAction={bookmarks.reload} />
            </ActionPanel>
          }
        />
      ) : !bookmarks.isLoading && bookmarks.items.length === 0 ? (
        <List.EmptyView
          icon={Icon.Bookmark}
          title={text === "" ? "No bookmarks" : "No bookmark matches"}
          description={text === "" ? "The browser has no bookmarks yet." : text}
        />
      ) : null}
      {bookmarks.items.map((bookmark) => (
        <List.Item
          key={`${bookmark.folder}/${bookmark.url}`}
          title={bookmark.title}
          subtitle={bookmark.url}
          icon={Icon.Bookmark}
          keywords={[bookmark.url, bookmark.folder]}
          accessories={[
            ...(bookmark.folder === "" ? [] : [{ tag: { value: bookmark.folder }, tooltip: "Folder" }]),
            { text: formatMoment(bookmark.addedAt), tooltip: "Bookmarked" },
          ]}
          actions={
            <ActionPanel>
              <Action.OpenInBrowser title="Open in Browser" url={bookmark.url} shortcut="open" />
              <Action.CopyToClipboard title="Copy URL" content={bookmark.url} shortcut="copy" />
              <Action.Push
                title="Note"
                icon={Icon.Pencil}
                shortcut="edit"
                target={<NoteForm url={bookmark.url} onSaved={bookmarks.reload} />}
              />
              <Action title="Refresh" icon={Icon.ArrowClockwise} shortcut="refresh" onAction={bookmarks.reload} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
