import { Action, ActionPanel, Clipboard, closeMainWindow, Form, getPreferenceValues, popToRoot, showHUD } from "@vicinae/api";
import { useEffect, useState } from "react";

import { readClipboardText } from "~/api/clipboard";
import { deliver } from "~/utils/deliver";
import { initialText } from "~/utils/input";

type Props = {
  /** What the command does, in the imperative: "URL Encode". */
  label: string;
  placeholder: string;
  transform: (text: string) => string | Promise<string>;
  /** A value handed in by a deeplink or a script, which beats the clipboard. */
  argument?: string | undefined;
};

/**
 * The body shared by the encode, decode and shorten commands: a field prefilled
 * from the argument or the clipboard, a transform, and the result copied or pasted.
 *
 * These have to be `view` commands. A `no-view` worker gets no clipboard (see
 * docs/api-porting.md), so the clipboard is read on mount instead and the field stays
 * editable: pasting by hand is always possible.
 */
export default function TransformForm({ label, placeholder, transform, argument }: Props) {
  const { output = "copy" } = getPreferenceValues<Preferences>();
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    readClipboardText().then((clipboard) => {
      const initial = initialText(argument, clipboard);
      if (initial) setText(initial);
      else setError("The clipboard is empty. Type or paste something.");
    });
  }, [argument]);

  async function submit(values: Form.Values): Promise<boolean> {
    const input = String(values.text ?? "").trim();
    if (!input) {
      setError("There is nothing to work on.");
      return false;
    }

    setBusy(true);
    try {
      await deliver(await transform(input), output, {
        copy: (result) => Clipboard.copy(result),
        paste: (result) => Clipboard.paste(result),
        closeWindow: closeMainWindow,
        backToRoot: popToRoot,
      });
      await showHUD(`${label}: ${output === "paste" ? "pasted" : "copied to clipboard"}`);
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
          <Action.SubmitForm title={output === "paste" ? "Paste Result" : "Copy Result"} onSubmit={submit} />
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
