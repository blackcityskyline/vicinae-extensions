import { Action, ActionPanel, Clipboard, closeMainWindow, Form, getPreferenceValues, popToRoot, showHUD } from "@vicinae/api";
import { useEffect, useState } from "react";

import { textToShorten } from "~/utils/url";

type Props = {
  /** What the command does, in the imperative: "URL Encode". */
  label: string;
  placeholder: string;
  transform: (text: string) => string | Promise<string>;
  /** A link handed in by a deeplink or a script, which beats the clipboard. */
  argument?: string | undefined;
};

/**
 * The body shared by all four commands.
 *
 * They have to be `view` commands. A `no-view` worker gets no clipboard — measured on
 * this machine: `Clipboard.readText()` answers "" and `Clipboard.copy()` reports success
 * while leaving the clipboard untouched — so the upstream shape of reading the clipboard,
 * acting and closing cannot work here. The clipboard is read on mount instead, and the
 * field stays editable, which is the one thing this gives up: pasting by hand is always
 * possible.
 */
export default function ClipboardForm({ label, placeholder, transform, argument }: Props) {
  const { output = "copy" } = getPreferenceValues<Preferences>();
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Clipboard.readText().then((clipboard) => {
      const initial = textToShorten(argument, clipboard);

      if (initial) {
        setText(initial);
      } else {
        setError("Nothing to work on. Type a link instead.");
      }
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
      const result = await transform(input);

      if (output === "paste") {
        // The window closes first, then the paste. The other way round the form still
        // holds focus and the link lands in it. Vicinae's own `Action.Paste` orders it
        // this way with the comment "we close before pasting to make sure focus has been
        // properly restored", which is the same thing measured in the downloads manager.
        await closeMainWindow();
        await Clipboard.paste(result);
      } else {
        await Clipboard.copy(result);
        await popToRoot();
      }

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
