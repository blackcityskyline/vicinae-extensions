import { Action, ActionPanel, Clipboard, Detail, Form, Icon } from "@vicinae/api";

import { useEffect, useState } from "react";

import { readClipboardText } from "~/api/clipboard";
import { writeQrImage } from "~/api/qr-file";
import { initialText } from "~/utils/input";

type Ready = { text: string; image: string };

/**
 * Text in, QR code out. The field starts with the argument or the clipboard but
 * stays editable, so typing a new text does not need another command or a copy.
 */
export default function TextToQr(props: { arguments?: Arguments.Qr }) {
  const argument = props.arguments?.text;
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [ready, setReady] = useState<Ready | null>(null);

  useEffect(() => {
    readClipboardText().then((clipboard) => setText(initialText(argument, clipboard)));
  }, [argument]);

  function submit(values: Form.Values) {
    const input = String(values.text ?? "").trim();
    if (!input) {
      setError("Type or paste the text to encode.");
      return;
    }
    try {
      setError("");
      setReady({ text: input, image: writeQrImage(input) });
    } catch (failure) {
      setError((failure as Error).message);
    }
  }

  if (ready) {
    const { text: encoded, image } = ready;
    return (
      <Detail
        navigationTitle="QR Code"
        markdown={`![QR code](file://${image})`}
        metadata={
          <Detail.Metadata>
            <Detail.Metadata.Label title="Encodes" text={encoded.length > 200 ? `${encoded.slice(0, 200)}…` : encoded} />
          </Detail.Metadata>
        }
        actions={
          <ActionPanel>
            <Action title="Copy QR Image" icon={Icon.Image} shortcut={{ modifiers: ["ctrl"], key: "i" }} onAction={() => Clipboard.copy({ file: image })} />
            <Action.CopyToClipboard title="Copy Text" content={encoded} shortcut="copy" />
            <Action
              title="Edit Text"
              icon={Icon.Pencil}
              shortcut={{ modifiers: ["ctrl"], key: "e" }}
              onAction={() => {
                setText(encoded);
                setReady(null);
              }}
            />
          </ActionPanel>
        }
      />
    );
  }

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Show QR Code" icon={Icon.BarCode} shortcut="save" onSubmit={submit} />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="text"
        title="Text"
        placeholder="The text or link to encode"
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
