import {
  Action,
  ActionPanel,
  Detail,
  Icon,
  open,
  showInFileBrowser,
} from "@vicinae/api";
import { useEffect, useState } from "react";
import * as path from "node:path";
import { AppPicker } from "./app-picker";
import { renderPreview } from "./preview-body";
import { previewWithSushi } from "./preview";

/**
 * Full-screen preview of one file, opened with Space.
 *
 * There is no Quick Look in Vicinae, and Sushi's floating window cannot be
 * relied on for keyboard focus, so the body is rendered in a pushed Detail
 * view: images inline, `.md` as markdown, source as a fenced block. Escape
 * returns to the list because this is ordinary navigation.
 */
export function PreviewPane(props: { filePath: string }) {
  const { filePath } = props;
  const name = path.basename(filePath);
  const [markdown, setMarkdown] = useState("*Loading…*");

  useEffect(() => {
    let cancelled = false;
    renderPreview(filePath)
      .catch(
        (e: unknown) =>
          `## Cannot preview\n\n\`${filePath}\`\n\n${e instanceof Error ? e.message : String(e)}`,
      )
      .then((body) => {
        if (!cancelled) setMarkdown(body);
      });
    return () => {
      cancelled = true;
    };
  }, [filePath]);

  return (
    <Detail
      navigationTitle={`Preview → ${name}`}
      markdown={markdown}
      actions={
        <ActionPanel>
          <Action
            title="Open"
            icon={Icon.BlankDocument}
            onAction={() => open(filePath)}
          />
          <Action.Push
            title="Open With…"
            icon={Icon.AppWindow}
            target={<AppPicker filePath={filePath} />}
          />
          <Action
            title="Preview in Sushi"
            icon={Icon.Eye}
            onAction={() => previewWithSushi(filePath)}
          />
          <Action
            title="Show in File Manager"
            icon={Icon.Folder}
            onAction={() => showInFileBrowser(filePath)}
          />
        </ActionPanel>
      }
    />
  );
}
