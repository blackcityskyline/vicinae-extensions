import { Action, ActionPanel, Icon, List } from "@vicinae/api";
import { useEffect, useState } from "react";

import { NoteForm } from "~/components/note-form";
import { run, type ClosedTab } from "~/lib/cli";
import { brotabNgBinary } from "~/lib/preferences";
import { formatMoment } from "~/lib/time";

/**
 * What the browser still remembers of recently closed tabs, from its session
 * store. Opening one is the closest thing to the browser's own undo without
 * being inside it.
 */
export default function ClosedTabs() {
  const [closed, setClosed] = useState<ClosedTab[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(): Promise<void> {
    try {
      setClosed((await run<{ closed: ClosedTab[] }>(brotabNgBinary(), ["closed"])).closed);
      setError(null);
    } catch (failure) {
      setClosed([]);
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <List isLoading={closed === null} navigationTitle="Recently Closed Tabs" searchBarPlaceholder="Search closed tabs">
      {error !== null ? (
        <List.EmptyView
          icon={Icon.Warning}
          title="Could not read the session store"
          description={error}
          actions={
            <ActionPanel>
              <Action title="Refresh" icon={Icon.ArrowClockwise} shortcut="refresh" onAction={load} />
            </ActionPanel>
          }
        />
      ) : closed !== null && closed.length === 0 ? (
        <List.EmptyView icon={Icon.Undo} title="No recently closed tabs" description="The browser has not closed a tab since it started." />
      ) : null}
      {(closed ?? []).map((tab) => (
        <List.Item
          key={`${tab.closedAt}-${tab.url}`}
          title={tab.title}
          subtitle={tab.url}
          icon={Icon.Undo}
          keywords={[tab.url]}
          accessories={[{ text: formatMoment(tab.closedAt), tooltip: "Closed" }]}
          actions={
            <ActionPanel>
              <Action.OpenInBrowser title="Open in Browser" url={tab.url} shortcut="open" />
              <Action.CopyToClipboard title="Copy URL" content={tab.url} shortcut="copy" />
              <Action.Push title="Note" icon={Icon.Pencil} shortcut="edit" target={<NoteForm url={tab.url} />} />
              <Action title="Refresh" icon={Icon.ArrowClockwise} shortcut="refresh" onAction={load} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
