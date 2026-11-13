import { Action, ActionPanel, Alert, confirmAlert, Grid, Icon, List, LocalStorage, showToast, Toast } from "@vicinae/api";
import fs from "node:fs";
import { useEffect, useState, type ReactNode } from "react";

import { mergeSessions, movements, movePinned, parsePinned, pin, serializePinned, unpin, type Entry } from "~/lib/entries";
import { openInNvim } from "~/lib/open";
import { ago, shortHome } from "~/lib/paths";
import { layout, nvimPath, recentDirsFile } from "~/lib/preferences";
import { escapeNvimPath, forgetRecent, readRecentFile, recordRecent, sessionEntries } from "~/lib/sessions";

const PINNED_KEY = "neovim-pinned-sessions";

export default function SearchRecentSessions() {
  const [sessions, setSessions] = useState<Entry[] | null>(null);
  const [pinned, setPinned] = useState<Entry[] | null>(null);

  function load(): void {
    setSessions(mergeSessions(sessionEntries(), readRecentFile(recentDirsFile())));
  }

  useEffect(() => {
    load();
    void LocalStorage.getItem<string>(PINNED_KEY).then((raw) => setPinned(parsePinned(raw)));
  }, []);

  async function save(next: Entry[]): Promise<void> {
    setPinned(next);
    await LocalStorage.setItem(PINNED_KEY, serializePinned(next));
  }

  async function open(entry: Entry): Promise<void> {
    try {
      // A session runs its own `cd`; a recent directory is opened as the working one.
      if (entry.source === "persistence" && entry.file !== undefined) {
        await openInNvim(nvimPath(), ["-S", escapeNvimPath(entry.file)]);
      } else {
        await openInNvim(nvimPath(), [], entry.path);
      }
      recordRecent(entry.path, recentDirsFile());
      load();
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Could not start Neovim",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function forget(entry: Entry): Promise<void> {
    forgetRecent(entry.path, recentDirsFile());
    load();
  }

  async function removeSession(entry: Entry): Promise<void> {
    const confirmed = await confirmAlert({
      title: `Delete the session for ${entry.name}?`,
      message: "The saved window layout and buffers are lost. The files in the directory stay.",
      primaryAction: { title: "Delete", style: Alert.ActionStyle.Destructive },
      dismissAction: { title: "Cancel", style: Alert.ActionStyle.Cancel },
    });
    if (!confirmed) return;

    try {
      if (entry.file !== undefined) fs.rmSync(entry.file);
      load();
      await showToast({ style: Toast.Style.Success, title: "Session deleted" });
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Could not delete the session",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  function actions(entry: Entry, pinnedEntries: Entry[]): ReactNode {
    const isPinned = pinnedEntries.some((candidate) => candidate.path === entry.path);
    const allowed = isPinned ? movements(pinnedEntries, entry.path) : [];

    return (
      <ActionPanel>
        <Action title="Open in Neovim" icon={Icon.Terminal} shortcut="open" onAction={() => void open(entry)} />
        <Action
          title={isPinned ? "Unpin Entry" : "Pin Entry"}
          icon={isPinned ? Icon.PinDisabled : Icon.Pin}
          shortcut="pin"
          onAction={() =>
            void save(isPinned ? unpin(pinnedEntries, entry.path) : pin(pinnedEntries, entry))
          }
        />
        {allowed.includes("up") ? (
          <Action
            title="Move Up"
            icon={Icon.ArrowUp}
            shortcut="move-up"
            onAction={() => void save(movePinned(pinnedEntries, entry.path, -1))}
          />
        ) : null}
        {allowed.includes("down") ? (
          <Action
            title="Move Down"
            icon={Icon.ArrowDown}
            shortcut="move-down"
            onAction={() => void save(movePinned(pinnedEntries, entry.path, 1))}
          />
        ) : null}
        <Action.CopyToClipboard title="Copy Directory" content={entry.path} shortcut="copy-path" />
        <Action title="Refresh" icon={Icon.ArrowClockwise} shortcut="refresh" onAction={load} />
        {entry.source === "recent" ? (
          <ActionPanel.Section>
            <Action
              title="Remove from Recent"
              icon={Icon.Trash}
              style="destructive"
              shortcut="remove"
              onAction={() => void forget(entry)}
            />
          </ActionPanel.Section>
        ) : (
          <ActionPanel.Section>
            <Action
              title="Delete Session"
              icon={Icon.Trash}
              style="destructive"
              shortcut="remove-all"
              onAction={() => void removeSession(entry)}
            />
          </ActionPanel.Section>
        )}
      </ActionPanel>
    );
  }

  const pinnedEntries = pinned ?? [];
  const pinnedPaths = new Set(pinnedEntries.map((entry) => entry.path));
  const recent = (sessions ?? []).filter((entry) => !pinnedPaths.has(entry.path));

  function accessories(entry: Entry): List.Item.Accessory[] {
    return [
      ...(entry.missing ? [{ tag: { value: "Missing", color: "red" as const } }] : []),
      { tag: { value: entry.source } },
      { text: ago(entry.lastOpened) },
    ];
  }

  if (layout() === "grid") {
    return (
      <Grid isLoading={sessions === null} navigationTitle="Recent Sessions" columns={5} searchBarPlaceholder="Search sessions">
        <Grid.EmptyView
          icon={Icon.Folder}
          title="No recent sessions"
          description="Open a file or folder in Neovim and it shows up here."
        />
        <Grid.Section title="Pinned">
          {pinnedEntries.map((entry) => (
            <Grid.Item
              key={`pinned-${entry.path}`}
              title={entry.name}
              subtitle={shortHome(entry.path)}
              content={Icon.Pin}
              keywords={["pinned", entry.source, entry.name]}
              actions={actions(entry, pinnedEntries)}
            />
          ))}
        </Grid.Section>
        <Grid.Section title="Recent Sessions">
          {recent.map((entry) => (
            <Grid.Item
              key={entry.id}
              title={entry.name}
              subtitle={shortHome(entry.path)}
              content={Icon.Folder}
              keywords={[entry.source, entry.name]}
              actions={actions(entry, pinnedEntries)}
            />
          ))}
        </Grid.Section>
      </Grid>
    );
  }

  return (
    <List isLoading={sessions === null} navigationTitle="Recent Sessions" searchBarPlaceholder="Search sessions">
      <List.EmptyView
        icon={Icon.Folder}
        title="No recent sessions"
        description="Open a file or folder in Neovim and it shows up here."
      />
      <List.Section title="Pinned">
        {pinnedEntries.map((entry) => (
          <List.Item
            key={`pinned-${entry.path}`}
            title={entry.name}
            subtitle={shortHome(entry.path)}
            icon={Icon.Pin}
            keywords={["pinned"]}
            accessories={accessories(entry)}
            actions={actions(entry, pinnedEntries)}
          />
        ))}
      </List.Section>
      <List.Section title="Recent Sessions">
        {recent.map((entry) => (
          <List.Item
            key={entry.id}
            title={entry.name}
            subtitle={shortHome(entry.path)}
            icon={Icon.Folder}
            accessories={accessories(entry)}
            actions={actions(entry, pinnedEntries)}
          />
        ))}
      </List.Section>
    </List>
  );
}
