import { Action, ActionPanel, Clipboard, Detail, Icon } from "@vicinae/api";
import { useEffect, useState } from "react";

import { readClipboardText } from "~/api/clipboard";
import { writeQrImage } from "~/api/qr-file";
import { initialText } from "~/utils/input";

type Shown = { kind: "loading" } | { kind: "empty" } | { kind: "failed"; message: string } | { kind: "ready"; text: string; image: string };

export default function TextToQr(props: { arguments?: Arguments.Qr }) {
  const argument = props.arguments?.text;
  const [shown, setShown] = useState<Shown>({ kind: "loading" });

  useEffect(() => {
    readClipboardText().then((clipboard) => {
      const text = initialText(argument, clipboard);
      if (!text) {
        setShown({ kind: "empty" });
        return;
      }
      try {
        setShown({ kind: "ready", text, image: writeQrImage(text) });
      } catch (failure) {
        setShown({ kind: "failed", message: (failure as Error).message });
      }
    });
  }, [argument]);

  if (shown.kind === "loading") return <Detail markdown="Reading the clipboard…" />;
  if (shown.kind === "empty") {
    return <Detail markdown={"## Nothing to encode\n\nCopy some text or a link, then run this command again."} />;
  }
  if (shown.kind === "failed") return <Detail markdown={`## No QR code\n\n${shown.message}`} />;

  const { text, image } = shown;
  return (
    <Detail
      navigationTitle="QR Code"
      markdown={`![QR code](file://${image})`}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label title="Encodes" text={text.length > 200 ? `${text.slice(0, 200)}…` : text} />
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          <Action title="Copy QR Image" icon={Icon.Image} onAction={() => Clipboard.copy({ file: image })} />
          <Action.CopyToClipboard title="Copy Text" content={text} />
        </ActionPanel>
      }
    />
  );
}
