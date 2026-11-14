import { Action, ActionPanel, Form, showToast, Toast, useNavigation } from "@vicinae/api";
import { useEffect, useState } from "react";

import { run, type Note } from "~/lib/cli";
import { brotabNgBinary } from "~/lib/preferences";

/**
 * Writes one note for one page URL. The body is loaded through `notes <url>`:
 * `note get` exits non-zero when there is none, which the call would report as a
 * failure rather than the empty body a new note starts with.
 *
 * A note started from the search bar passes `draft` instead of `url`: the fields
 * arrive filled in but it is still a new note, so the URL stays editable.
 */
export function NoteForm({
  url,
  draft,
  onSaved,
}: {
  /** Editing this note. */
  url?: string;
  /** Creating a note with these fields already filled in. */
  draft?: { url?: string; body?: string };
  onSaved?: () => void;
}) {
  const creating = url === undefined;
  const [address, setAddress] = useState(url ?? draft?.url ?? "");
  const [body, setBody] = useState(draft?.body ?? "");
  const [loaded, setLoaded] = useState(creating);
  const [busy, setBusy] = useState(false);
  const { pop } = useNavigation();

  useEffect(() => {
    if (url === undefined) return;

    run<{ notes: Note[] }>(brotabNgBinary(), ["notes", url])
      .then(({ notes }) => setBody((current) => (current === "" ? (notes.find((note) => note.url === url)?.body ?? "") : current)))
      .catch((failure: Error) => {
        void showToast({ style: Toast.Style.Failure, title: "Could not read the note", message: failure.message });
      })
      .finally(() => setLoaded(true));
  }, [url]);

  async function save(): Promise<boolean> {
    const target = address.trim();
    if (!target) {
      await showToast({ style: Toast.Style.Failure, title: "A page URL is required" });
      return false;
    }

    setBusy(true);
    try {
      await run<{ note: Note }>(brotabNgBinary(), ["note", "set", target, body]);
      await showToast({ style: Toast.Style.Success, title: "Note saved", message: target });
      onSaved?.();
      pop();
      return true;
    } catch (failure) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Could not save the note",
        message: failure instanceof Error ? failure.message : String(failure),
      });
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <Form
      isLoading={!loaded || busy}
      navigationTitle={creating ? "New Note" : "Edit Note"}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Save Note" shortcut="save" onSubmit={save} />
        </ActionPanel>
      }
    >
      {creating ? (
        <Form.TextField
          id="url"
          title="Page URL"
          placeholder="https://example.com/page"
          value={address}
          onChange={setAddress}
          autoFocus={address === ""}
        />
      ) : null}
      <Form.TextArea
        id="body"
        title="Note"
        placeholder="What is worth remembering about this page?"
        value={body}
        onChange={setBody}
        autoFocus={!creating || address !== ""}
      />
    </Form>
  );
}
