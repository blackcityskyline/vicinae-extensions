import { Action, ActionPanel, Icon, List, showToast, Toast } from "@vicinae/api";
import { useState } from "react";

import { NoteForm } from "~/components/note-form";
import { looksLikeUrl } from "~/lib/note-target";
import { notesPage, removeNote, type Note } from "~/lib/notes";
import { PAGE_SIZE, usePaged } from "~/lib/paging";
import { formatMoment } from "~/lib/time";

/** A note is a page URL and a body; the first line is the title a list can show. */
function titleOf(note: Note): string {
  const firstLine = note.body.split("\n").find((line) => line.trim() !== "");
  return firstLine?.trim() || note.url;
}

export default function Notes() {
  const [query, setQuery] = useState("");
  const text = query.trim();

  const notes = usePaged<Note>(
    async (offset) => notesPage(text, undefined, PAGE_SIZE, offset),
    text,
  );

  /** The search text becomes the URL for a page and the body for anything else. */
  const draft = looksLikeUrl(text) ? { url: text } : { body: text };
  const create = <NoteForm draft={draft} onSaved={notes.reload} />;

  async function remove(note: Note): Promise<void> {
    try {
      removeNote(note.url);
      notes.forget((candidate) => candidate.url === note.url);
      await showToast({ style: Toast.Style.Success, title: "Note removed", message: note.url });
    } catch (failure) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Could not remove the note",
        message: failure instanceof Error ? failure.message : String(failure),
      });
    }
  }

  return (
    <List
      filtering={false}
      isLoading={notes.isLoading}
      throttle
      navigationTitle="Notes"
      searchBarPlaceholder="Search notes"
      onSearchTextChange={setQuery}
      pagination={{ hasMore: notes.hasMore, onLoadMore: notes.loadMore }}
      actions={
        <ActionPanel>
          <Action.Push title="New Note" icon={Icon.Plus} shortcut="new" target={create} />
          <Action title="Refresh" icon={Icon.ArrowClockwise} shortcut="refresh" onAction={notes.reload} />
        </ActionPanel>
      }
    >
      {notes.error !== null ? (
        <List.EmptyView
          icon={Icon.Warning}
          title="Could not read the notes"
          description={notes.error}
          actions={
            <ActionPanel>
              <Action title="Refresh" icon={Icon.ArrowClockwise} shortcut="refresh" onAction={notes.reload} />
            </ActionPanel>
          }
        />
      ) : !notes.isLoading && notes.items.length === 0 ? (
        <List.EmptyView
          icon={Icon.Text}
          title={text === "" ? "No notes yet" : "No note matches"}
          description={
            text === ""
              ? "Save one from a tab, a closed tab or a history result."
              : `Start a note about "${text}".`
          }
          actions={
            <ActionPanel>
              <Action.Push
                title={looksLikeUrl(text) ? "New Note for This Page" : "New Note with This Text"}
                icon={Icon.Plus}
                shortcut="new"
                target={create}
              />
            </ActionPanel>
          }
        />
      ) : null}
      {notes.items.map((note) => (
        <List.Item
          key={note.url}
          title={titleOf(note)}
          subtitle={note.url}
          icon={Icon.Text}
          keywords={[note.url]}
          accessories={[{ text: formatMoment(note.updatedAt), tooltip: "Updated" }]}
          actions={
            <ActionPanel>
              <Action.Push
                title="Edit Note"
                icon={Icon.Pencil}
                shortcut="edit"
                target={<NoteForm url={note.url} onSaved={notes.reload} />}
              />
              <Action.Push title="New Note" icon={Icon.Plus} shortcut="new" target={create} />
              <Action.OpenInBrowser title="Open in Browser" url={note.url} shortcut="open" />
              <Action.CopyToClipboard title="Copy Note" content={note.body} shortcut="copy" />
              <Action.CopyToClipboard title="Copy URL" content={note.url} shortcut="copy-path" />
              <Action
                title="Remove Note"
                icon={Icon.Trash}
                style="destructive"
                shortcut="remove"
                onAction={() => remove(note)}
              />
              <Action title="Refresh" icon={Icon.ArrowClockwise} shortcut="refresh" onAction={notes.reload} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
