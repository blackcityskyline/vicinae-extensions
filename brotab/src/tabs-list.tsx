import { Action, ActionPanel, closeMainWindow, getPreferenceValues, Icon, List, showToast, Toast } from "@vicinae/api";
import { useEffect, useState } from "react";

import { activateTab, BrotabNotFoundError, closeTab, describeError, listTabs } from "~/lib/brotab";
import type { Tab } from "~/lib/tabs";

function binary(): string {
  const { brotabPath } = getPreferenceValues<{ brotabPath?: string }>();
  return brotabPath?.trim() || "brotab";
}

export default function TabsList() {
  const [tabs, setTabs] = useState<Tab[] | null>(null);
  const [notInstalled, setNotInstalled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(): Promise<void> {
    try {
      const next = await listTabs(binary());
      setTabs(next);
      setNotInstalled(false);
      setError(null);
    } catch (failure) {
      if (failure instanceof BrotabNotFoundError) {
        setTabs(null);
        setNotInstalled(true);
        setError(null);
        return;
      }

      setTabs([]);
      setNotInstalled(false);
      setError(describeError(failure));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function run(command: (path: string, id: string) => Promise<void>, id: string): Promise<void> {
    try {
      await command(binary(), id);
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

  if (notInstalled) {
    return (
      <List navigationTitle="Open Tabs" isLoading={false}>
        <List.EmptyView
          icon={Icon.Warning}
          title="Brotab Not Installed"
          description={`${binary()} was not found. Install brotab, then point "Brotab Path" at it: https://github.com/balta2ar/brotab#installation`}
        />
      </List>
    );
  }

  return (
    <List
      isLoading={tabs === null}
      navigationTitle="Open Tabs"
      searchBarPlaceholder="Search open tabs"
    >
      {error !== null ? (
        <List.EmptyView icon={Icon.Warning} title="brotab failed" description={error} />
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
