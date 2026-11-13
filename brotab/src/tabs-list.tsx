import { Action, ActionPanel, closeMainWindow, Icon, List, showToast, Toast } from "@vicinae/api";
import { useEffect, useState } from "react";

import { activateTab, closeTab, describeError, listTabs } from "~/lib/mediator";
import type { Tab } from "~/lib/tabs";

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
          icon={Icon.Globe01}
          keywords={[tab.url]}
          actions={actions(tab)}
        />
      ))}
    </List>
  );
}
