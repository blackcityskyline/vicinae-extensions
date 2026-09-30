import { Action, ActionPanel, Clipboard, Form, popToRoot, showHUD } from "@vicinae/api";
import { useEffect, useState } from "react";

type Props = {
  /** What the command does, in the imperative: "URL Encode". */
  label: string;
  placeholder: string;
  transform: (text: string) => string | Promise<string>;
};

/**
 * The body shared by all three commands.
 *
 * They have to be `view` commands. A `no-view` worker gets no clipboard — on
 * this machine `Clipboard.readText()` in one returns "" whatever is in it — so
 * the upstream shape of reading the clipboard, acting and closing cannot work
 * here. The clipboard is read on mount instead, and the field stays editable,
 * which is the one thing this gives up: pasting by hand is always possible.
 */
export default function ClipboardForm({ label, placeholder, transform }: Props) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Clipboard.readText().then((clipboard) => {
      if (clipboard.trim()) {
        setText(clipboard);
      } else {
        setError("The clipboard is empty. Type something instead.");
      }
    });
  }, []);

  async function submit(values: Form.Values): Promise<boolean> {
    const input = String(values.text ?? "").trim();
    if (!input) {
      setError("There is nothing to work on.");
      return false;
    }

    setBusy(true);
    try {
      const result = await transform(input);
      await Clipboard.copy(result);
      await showHUD(`${label}: copied to clipboard`);
      await popToRoot();
      return true;
    } catch (failure) {
      setBusy(false);
      setError((failure as Error).message);
      return false;
    }
  }

  return (
    <Form
      isLoading={busy}
      actions={
        <ActionPanel>
          <Action.SubmitForm title={`Copy ${label} Result`} onSubmit={submit} />
          <Action.CopyToClipboard title="Copy Text Without Changing It" content={text} />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="text"
        title="Text"
        placeholder={placeholder}
        value={text}
        error={error}
        autoFocus
        onChange={(next) => {
          setText(next);
          setError("");
        }}
      />
    </Form>
  );
}
