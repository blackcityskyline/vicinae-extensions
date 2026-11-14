import { Action, ActionPanel, Detail, Icon } from "@vicinae/api";
import { useEffect, useState } from "react";

import { run, type Snapshot } from "~/lib/cli";
import { brotabNgBinary } from "~/lib/preferences";
import type { Tab } from "~/lib/tabs";

/**
 * The markdown renderer is bare bones and the text is a whole page, so only the
 * start of it is shown; the full text is one action away on the clipboard.
 */
const MAX_CHARS = 10_000;

/**
 * A tab's page text, from the content script the add-on runs for `get_text`.
 * The mediator runs it in every loaded tab and answers with all of them, which
 * is why this goes through `brotab-ng snapshot` rather than one HTTP call.
 */
export function PagePreview({ tab }: { tab: Tab }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setSnapshot(null);
    setError(null);
    run<{ snapshot: Snapshot }>(brotabNgBinary(), ["snapshot", tab.id])
      .then(({ snapshot }) => setSnapshot(snapshot))
      .catch((failure: Error) => setError(failure.message));
  }, [tab.id, attempt]);

  const text = snapshot?.text ?? "";
  const body =
    error !== null
      ? `# Could not read the page\n\n${error}`
      : text === ""
        ? `# ${tab.title || tab.url}\n\n${tab.url}\n\n_The page reported no text._`
        : `# ${tab.title || tab.url}\n\n${tab.url}\n\n${text.slice(0, MAX_CHARS)}${
            text.length > MAX_CHARS ? `\n\n… ${text.length - MAX_CHARS} more characters, see Copy Page Text` : ""
          }`;

  return (
    <Detail
      isLoading={snapshot === null && error === null}
      navigationTitle={tab.title || tab.url}
      markdown={body}
      actions={
        <ActionPanel>
          <Action.OpenInBrowser title="Open in Browser" url={tab.url} shortcut="open" />
          <Action.CopyToClipboard title="Copy URL" content={tab.url} shortcut="copy" />
          <Action.CopyToClipboard title="Copy Page Text" content={text} shortcut="copy-name" />
          <Action title="Refresh" icon={Icon.ArrowClockwise} shortcut="refresh" onAction={() => setAttempt((n) => n + 1)} />
        </ActionPanel>
      }
    />
  );
}
