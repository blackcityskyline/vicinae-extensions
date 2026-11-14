import { Action, ActionPanel, Icon, List, showToast, Toast } from "@vicinae/api";
import { useEffect, useState } from "react";

import { NoteForm } from "~/components/note-form";
import { run, type Note } from "~/lib/cli";
import { brotabNgBinary } from "~/lib/preferences";
import { formatMoment } from "~/lib/time";

/** A note is a page URL and a body; the first line is the title a list can show. */
function titleOf(note: Note): string {
  const firstLine = note.body.split("\n").find((line) => line.trim() !== "");
  return firstLine?.trim() || note.url;
}

export default function Notes() {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(): Promise<void> {
    try {
      setNotes((await run<{ notes: Note[] }>(brotabNgBinary(), ["notes"])).notes);
      setError(null);
    } catch (failure) {
      setNotes([]);
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function remove(note: Note): Promise<void> {
    try {
      await run<{ removed: boolean }>(brotabNgBinary(), ["note", "rm", note.url]);
      setNotes((current) => current?.filter((candidate) => candidate.url !== note.url) ?? []);
      await showToast({ style: Toast.Style.Success, title: "Note removed", message: note.url });
    } catch (failure) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Could not remove the note",
        message: failure instanceof Error ? failure.message : String(failure),
      });
    }
  }

  const newNote = <NoteForm onSaved={load} />;

  return (
    <List
      isLoading={notes === null}
      navigationTitle="Notes"
      searchBarPlaceholder="Search notes"
      actions={
        <ActionPanel>
          <Action.Push title="New Note" icon={Icon.Plus} shortcut="new" target={newNote} />
        </ActionPanel>
      }
    >
      {error !== null ? (
        <List.EmptyView
          icon={Icon.Warning}
          title="Could not read the notes"
          description={error}
          actions={
            <ActionPanel>
              <Action title="Refresh" icon={Icon.ArrowClockwise} shortcut="refresh" onAction={load} />
            </ActionPanel>
          }
        />
      ) : notes !== null && notes.length === 0 ? (
        <List.EmptyView
          icon={Icon.Text}
          title="No notes yet"
          description="Save one from a tab, a closed tab or a history result."
          actions={
            <ActionPanel>
              <Action.Push title="New Note" icon={Icon.Plus} shortcut="new" target={newNote} />
            </ActionPanel>
          }
        />
      ) : null}
      {(notes ?? []).map((note) => (
        <List.Item
          key={note.url}
          title={titleOf(note)}
          subtitle={note.url}
          icon={Icon.Text}
          keywords={[note.url]}
          accessories={[{ text: formatMoment(note.updatedAt), tooltip: "Updated" }]}
          actions={
            <ActionPanel>
              <Action.Push title="Edit Note" icon={Icon.Pencil} shortcut="edit" target={<NoteForm url={note.url} onSaved={load} />} />
              <Action.OpenInBrowser title="Open in Browser" url={note.url} shortcut="open" />
              <Action.CopyToClipboard title="Copy Note" content={note.body} shortcut="copy" />
              <Action.CopyToClipboard title="Copy URL" content={note.url} shortcut="copy-path" />
              <Action title="Remove Note" icon={Icon.Trash} shortcut="remove" onAction={() => remove(note)} />
              <Action title="Refresh" icon={Icon.ArrowClockwise} shortcut="refresh" onAction={load} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
