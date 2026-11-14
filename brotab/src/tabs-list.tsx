import { Action, ActionPanel, closeMainWindow, Icon, List, showToast, Toast } from "@vicinae/api";
import { useEffect, useState } from "react";

import { NoteForm } from "~/components/note-form";
import { activateTab, closeTab, describeError, listTabs } from "~/lib/mediator";
import type { Tab } from "~/lib/tabs";
import { PagePreview } from "~/page-preview";

export default function TabsList() {
  const [tabs, setTabs] = useState<Tab[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(): Promise<void> {
    try {
      setTabs(await listTabs());
      setError(null);
    } catch (failure) {
      setTabs([]);
      setError(describeError(failure));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function run(command: (id: string) => Promise<void>, id: string): Promise<void> {
    try {
      await command(id);
    } catch (failure) {
      await showToast({ style: Toast.Style.Failure, title: "brotab failed", message: describeError(failure) });
    }
  }

  function actions(tab: Tab) {
    return (
      <ActionPanel>
        <Action
          title="Activate Tab"
          icon={Icon.ArrowRight}
          shortcut="open"
          onAction={async () => {
            await run(activateTab, tab.id);
            await closeMainWindow();
          }}
        />
        <Action.CopyToClipboard title="Copy URL" content={tab.url} shortcut="copy" />
        {tab.unloaded ? null : (
          <Action.Push
            title="Preview Page"
            icon={Icon.Eye}
            shortcut={{ modifiers: ["ctrl", "shift"], key: "v" }}
            target={<PagePreview tab={tab} />}
          />
        )}
        <Action.Push title="Note" icon={Icon.Pencil} shortcut="edit" target={<NoteForm url={tab.url} />} />
        <Action
          title="Close Tab"
          icon={Icon.XMarkCircle}
          shortcut="remove"
          onAction={async () => {
            await run(closeTab, tab.id);
            setTabs((current) => current?.filter((candidate) => candidate.id !== tab.id) ?? []);
          }}
        />
        <Action title="Refresh" icon={Icon.ArrowClockwise} shortcut="refresh" onAction={load} />
      </ActionPanel>
    );
  }

  return (
    <List isLoading={tabs === null} navigationTitle="Open Tabs" searchBarPlaceholder="Search open tabs">
      {error !== null ? (
        <List.EmptyView
          icon={Icon.Warning}
          title="brotab is not reachable"
          description={error}
          actions={
            <ActionPanel>
              <Action title="Refresh" icon={Icon.ArrowClockwise} shortcut="refresh" onAction={load} />
            </ActionPanel>
          }
        />
      ) : tabs !== null && tabs.length === 0 ? (
        <List.EmptyView
          icon={Icon.Globe01}
          title="No tabs found"
          description="The browser is running, but its brotab extension reported no tabs."
        />
      ) : null}
      {(tabs ?? []).map((tab) => (
        <List.Item
          key={tab.id}
          title={tab.title || tab.url}
          subtitle={tab.url}
          icon={tab.unloaded ? Icon.ArrowsContract : Icon.Globe01}
          keywords={[...(tab.unloaded ? ["unloaded", "discarded"] : []), tab.url]}
          accessories={tab.unloaded ? [{ tag: { value: "U" }, tooltip: "Unloaded from memory" }] : []}
          actions={actions(tab)}
        />
      ))}
    </List>
  );
}
