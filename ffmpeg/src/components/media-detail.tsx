import { Action, ActionPanel, Detail } from "@vicinae/api";
import path from "node:path";

import type { Probe } from "~/api/probe";
import { describe, toMarkdown } from "~/utils/media";

type Props = {
  file: string;
  probe: Probe;
};

/** The same text the pane shows is what "Copy Info" puts on the clipboard. */
export function MediaDetail({ file, probe }: Props) {
  const sections = describe(probe, file);
  const markdown = toMarkdown(sections);

  return (
    <Detail
      navigationTitle={path.basename(file)}
      markdown={markdown}
      actions={
        <ActionPanel>
          <Action.CopyToClipboard title="Copy Info" content={markdown} shortcut="copy" />
          <Action.CopyToClipboard
            title="Copy ffprobe JSON"
            content={JSON.stringify(probe, null, 2)}
            shortcut="copy-name"
          />
          <Action.CopyToClipboard title="Copy Path" content={file} shortcut="copy-path" />
        </ActionPanel>
      }
    />
  );
}
