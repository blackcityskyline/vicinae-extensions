import { Action, ActionPanel, Clipboard, Form, popToRoot, showHUD, showToast, Toast } from "@vicinae/api";
import { useEffect, useState } from "react";

import { createPaste } from "~/api";
import { SYNTAXES } from "~/syntaxes";

const EXPIRY = [
  { days: 1, title: "1 day" },
  { days: 7, title: "7 days" },
  { days: 30, title: "30 days" },
  { days: 90, title: "90 days" },
  { days: 365, title: "365 days" },
];

export default function CreatePaste() {
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // A `no-view` worker gets no clipboard on this machine, so the command is a form and
  // the clipboard is read on mount instead. The field stays editable.
  useEffect(() => {
    Clipboard.readText().then((text) => {
      if (text.trim()) setContent(text);
    });
  }, []);

  async function submit(values: Form.Values): Promise<boolean> {
    const body = String(values.content ?? "");
    if (!body.trim()) {
      setError("There is nothing to paste.");
      return false;
    }

    setError("");
    setBusy(true);

    try {
      const url = await createPaste({
        content: body,
        title: String(values.title ?? ""),
        syntax: String(values.syntax ?? ""),
        expiryDays: Number(values.expiry ?? "1"),
      });

      await Clipboard.copy(url);
      await popToRoot();
      await showHUD(`Created ${url}`);
      return true;
    } catch (failure) {
      setBusy(false);
      await showToast({
        style: Toast.Style.Failure,
        title: "Could not create the paste",
        message: (failure as Error).message,
      });
      return false;
    }
  }

  return (
    <Form
      isLoading={busy}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Create Paste" onSubmit={submit} />
        </ActionPanel>
      }
    >
      <Form.TextArea
        id="content"
        title="Content"
        placeholder="Paste or type what to share"
        value={content}
        onChange={setContent}
        error={error}
        autoFocus
      />
      <Form.TextField id="title" title="Title" placeholder="Optional" />
      <Form.Dropdown id="syntax" title="Syntax" defaultValue="" storeValue>
        <Form.Dropdown.Item value="" title="Plain text" />
        {SYNTAXES.map((syntax) => (
          <Form.Dropdown.Item key={syntax.id} value={syntax.id} title={syntax.title} />
        ))}
      </Form.Dropdown>
      <Form.Dropdown id="expiry" title="Expiry" defaultValue="1" storeValue>
        {EXPIRY.map((option) => (
          <Form.Dropdown.Item key={option.days} value={String(option.days)} title={option.title} />
        ))}
      </Form.Dropdown>
      <Form.Description text="The link is unlisted: anyone who has it can read the paste." />
    </Form>
  );
}
