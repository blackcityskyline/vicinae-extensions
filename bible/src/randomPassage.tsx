import {
  Action,
  ActionPanel,
  List,
  showToast,
  Toast,
} from "@raycast/api";
import * as React from "react";

import { createClipboardText, createMarkdown } from "./bibleSearch";
import { localizeReference, randomReference } from "./books";
import type { ReferenceSearchResult } from "./types";
import { useBibleSearch } from "./useBibleSearch";
import { useBibleVersion } from "./useBibleVersion";

/**
 * One random chapter from the version the search command remembers.
 *
 * No preferences of its own: the formatting here is the reading default (reference
 * and copyright in the preview, a plain reference on the clipboard), because a
 * second copy of the search command's five checkboxes would drift from the first.
 */
export default function RandomPassage() {
  const [version] = useBibleVersion();
  const [reference, setReference] = React.useState<string | null>(null);
  const { data, isLoading, error } = useBibleSearch({
    search: reference ?? undefined,
    version,
  });

  React.useEffect(() => {
    if (version && !reference) setReference(randomReference());
  }, [version, reference]);

  React.useEffect(() => {
    if (error) {
      showToast({ title: "Error", message: error.message, style: Toast.Style.Failure });
    }
  }, [error]);

  const another = React.useCallback(() => {
    setReference((current) => randomReference(current ?? undefined));
  }, []);

  if (!data) {
    return (
      <List isLoading={isLoading}>
        <List.EmptyView
          title={error ? "No Results" : "Opening a random passage…"}
          icon="../assets/extension-icon-64.png"
        />
      </List>
    );
  }

  const markdown = createMarkdown(
    { includeReferences: true, includeCopyright: true },
    data,
  );
  const clipboard = createClipboardText({ includeReferences: true }, data);

  return (
    <List isLoading={isLoading} isShowingDetail>
      <List.Item
        title={titleOf(data)}
        detail={<List.Item.Detail markdown={markdown} />}
        actions={
          <ActionPanel>
            <Action
              title="Another Passage"
              onAction={another}
              shortcut={{ modifiers: ["cmd"], key: "r" }}
            />
            <Action.CopyToClipboard content={clipboard} />
            <Action.Paste content={clipboard} />
            {data.url && (
              <Action.OpenInBrowser
                title={`Open at ${data.url.hostname}`}
                url={data.url.toString()}
              />
            )}
          </ActionPanel>
        }
      />
    </List>
  );
}

function titleOf(result: ReferenceSearchResult): string {
  return result.passages
    .map((passage) => localizeReference(passage.reference, result.version))
    .join("; ");
}
