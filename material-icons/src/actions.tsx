import { Action, Icon } from "@raycast/api";
import { ReactNode } from "react";

import DownloadForm from "./download-form";
import { MaterialIcon } from "./icons";

/** The three actions both views offer; the grid inserts Copy SVG between them. */
export function CommonIconActions({ icon, children }: { icon: MaterialIcon; children?: ReactNode }) {
  return (
    <>
      <Action.CopyToClipboard title="Copy Name" content={icon.name} shortcut={{ modifiers: ["cmd"], key: "c" }} />
      <Action.CopyToClipboard
        title="Copy Codepoint"
        content={icon.codepoint}
        shortcut={{ modifiers: ["cmd", "alt"], key: "c" }}
      />
      {children}
      <Action.Push
        icon={Icon.Download}
        title="Download"
        target={<DownloadForm icon={icon} />}
        shortcut={{ modifiers: ["cmd"], key: "d" }}
      />
    </>
  );
}
