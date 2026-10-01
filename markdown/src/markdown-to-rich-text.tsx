import { useEffect, useState } from "react";
import { Action, ActionPanel, Clipboard, closeMainWindow, Form, showHUD } from "@raycast/api";
import { richTextFromMarkdown } from "@contentful/rich-text-from-markdown";
import { documentToHtmlString } from "@contentful/rich-text-html-renderer";
import { documentToPlainTextString } from "@contentful/rich-text-plain-text-renderer";

/**
 * Clipboard Markdown to rich text, then into the focused window.
 *
 * Upstream's version is a `no-view` worker: read the clipboard, convert, copy, paste.
 * Two of those four steps do nothing here. Measured in a `no-view` worker on this
 * machine:
 *
 *   Clipboard.readText()  -> ""
 *   Clipboard.copy()      -> reports success, clipboard unchanged
 *
 * and both work in a `view` worker. So the command became one: the clipboard is read on
 * mount, shown in a field, and converted on submit. The field also means a paste that is
 * about to be made reversible can be looked at first, which the original could not offer.
 *
 * The rich part is real, and checked rather than assumed. `Clipboard.copy` with html and
 * text offers both MIME types:
 *
 *   copy({html, text})  -> wl-paste --list-types: text/html text/plain text/plain;charset=utf-8
 *   copy("plain")       -> wl-paste --list-types: text/plain text/plain;charset=utf-8 …
 *
 * What that gets you still depends on the application it lands in. A terminal takes
 * text/plain and shows the plain text. Word and Google Docs read text/html. That part is
 * not verifiable from here.
 */
export default function MarkdownToRichText() {
  const [markdown, setMarkdown] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Clipboard.readText().then((clipboard) => {
      if (clipboard?.trim()) {
        setMarkdown(clipboard);
      } else {
        setError("The clipboard is empty. Paste some Markdown instead.");
      }
    });
  }, []);

  async function submit(values: Form.Values): Promise<boolean> {
    const source = String(values.markdown ?? "");
    if (!source.trim()) {
      setError("There is nothing to convert.");
      return false;
    }

    setBusy(true);
    try {
      const document = await richTextFromMarkdown(source);
      const html = await documentToHtmlString(document);
      const text = documentToPlainTextString(document);

      await Clipboard.copy({ html, text });

      // The window closes before the paste. The other way round this form still holds
      // focus and the text lands in it — the same ordering Vicinae's own `Action.Paste`
      // uses, with the comment "we close before pasting to make sure focus has been
      // properly restored".
      await closeMainWindow();
      await Clipboard.paste({ html, text });

      await showHUD("Converted and pasted");
      return true;
    } catch (failure) {
      setBusy(false);
      setError(failure instanceof Error ? failure.message : String(failure));
      return false;
    }
  }

  return (
    <Form
      isLoading={busy}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Convert and Paste" onSubmit={submit} />
          <Action.CopyToClipboard title="Copy Markdown Without Changing It" content={markdown} />
        </ActionPanel>
      }
    >
      <Form.TextArea
        id="markdown"
        title="Markdown"
        placeholder="# Heading"
        value={markdown}
        error={error}
        autoFocus
        onChange={(next) => {
          setMarkdown(next);
          setError("");
        }}
      />
    </Form>
  );
}
