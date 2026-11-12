import { Action, ActionPanel, Alert, confirmAlert, Icon, List, showToast, Toast } from "@vicinae/api";
import fs from "node:fs";
import { useEffect, useState } from "react";

import { openInNvim } from "~/lib/open";
import { ago, shortHome } from "~/lib/paths";
import { nvimPath } from "~/lib/preferences";
import { escapeNvimPath, readSessions, type Session } from "~/lib/sessions";

export default function SearchRecentSessions() {
  const [sessions, setSessions] = useState<Session[] | null>(null);

  function load(): void {
    setSessions(readSessions());
  }

  useEffect(load, []);

  async function open(session: Session): Promise<void> {
    try {
      // The session runs its own `cd`, so no working directory is forced on it.
      await openInNvim(nvimPath(), ["-S", escapeNvimPath(session.file)]);
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Could not start Neovim",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function remove(session: Session): Promise<void> {
    const confirmed = await confirmAlert({
      title: `Delete the session for ${session.name}?`,
      message: "The saved window layout and buffers are lost. The files in the directory stay.",
      primaryAction: { title: "Delete", style: Alert.ActionStyle.Destructive },
      dismissAction: { title: "Cancel", style: Alert.ActionStyle.Cancel },
    });
    if (!confirmed) return;

    try {
      fs.rmSync(session.file);
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

  return (
    <List isLoading={sessions === null} navigationTitle="Recent Sessions" searchBarPlaceholder="Search sessions">
      {sessions !== null && sessions.length === 0 ? (
        <List.EmptyView
          icon={Icon.Clock}
          title="No saved sessions"
          description="persistence.nvim writes them to ~/.local/state/nvim/sessions; save one from Neovim first."
        />
      ) : null}
      {(sessions ?? []).map((session) => (
        <List.Item
          key={session.file}
          title={session.name}
          subtitle={shortHome(session.directory)}
          icon={Icon.Folder}
          accessories={
            session.missing ? [{ text: ago(session.modified) }, { tag: { value: "Missing" } }] : [{ text: ago(session.modified) }]
          }
          actions={
            <ActionPanel>
              <Action title="Open Session" icon={Icon.Terminal} shortcut="open" onAction={() => void open(session)} />
              <Action.CopyToClipboard
                title="Copy Directory"
                content={session.directory}
                shortcut="copy-path"
              />
              <Action
                title="Refresh"
                icon={Icon.ArrowClockwise}
                shortcut="refresh"
                onAction={load}
              />
              <ActionPanel.Section>
                <Action
                  title="Delete Session"
                  icon={Icon.Trash}
                  style="destructive"
                  shortcut="remove-all"
                  onAction={() => void remove(session)}
                />
              </ActionPanel.Section>
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
