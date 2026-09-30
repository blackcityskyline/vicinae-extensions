import {
  Action,
  ActionPanel,
  Alert,
  Clipboard,
  confirmAlert,
  getPreferenceValues,
  Icon,
  List,
  showHUD,
  showToast,
  Toast,
} from "@vicinae/api";
import type { Keyboard } from "@vicinae/api";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { useEffect, useState } from "react";

import { deletePermanently, moveToTrash, readDownloads } from "~/api/files";
import { formatSize, type Download } from "~/utils/downloads";

const RELOAD: Keyboard.Shortcut = { modifiers: ["cmd"], key: "r" };

function downloadsFolder(): string {
  const { folder } = getPreferenceValues<Preferences>();
  const chosen = (folder ?? "").trim();
  return chosen ? resolve(chosen.replace(/^~/, homedir())) : join(homedir(), "Downloads");
}

export default function Downloads() {
  const [folder] = useState(downloadsFolder);
  const [downloads, setDownloads] = useState<Download[] | null>(null);
  const [error, setError] = useState("");

  async function load() {
    const result = await readDownloads(folder);
    if (result.ok) {
      setDownloads(result.value);
    } else {
      setError(result.message);
    }
  }

  useEffect(() => {
    load();
  }, [folder]);

  function report(title: string, failure: { ok: false; message: string } | null) {
    if (failure) showToast({ style: Toast.Style.Failure, title, message: failure.message });
  }

  async function trash(download: Download) {
    const result = await moveToTrash(folder, download.path);
    report("Move to Trash Failed", result.ok ? null : result);
    if (result.ok) {
      await showHUD("Moved to Trash");
      await load();
    }
  }

  async function destroy(download: Download) {
    const confirmed = await confirmAlert({
      title: "Delete Permanently?",
      message: `${download.name}\n\nThis cannot be undone. Moving it to the trash is the other action on this row.`,
      primaryAction: { title: "Delete", style: Alert.ActionStyle.Destructive },
      dismissAction: { title: "Cancel", style: Alert.ActionStyle.Cancel },
    });
    if (!confirmed) return;

    const result = await deletePermanently(folder, download.path);
    report("Delete Failed", result.ok ? null : result);
    if (result.ok) {
      await showHUD("Deleted");
      await load();
    }
  }

  if (error) {
    return (
      <List.EmptyView
        icon={Icon.Warning}
        title="That folder could not be read"
        description={`${error}\n\nChange the folder in this extension's settings.`}
      />
    );
  }

  return (
    <List isLoading={downloads === null} searchBarPlaceholder="Search downloads" searchBarAccessory={
      <ActionPanel>
        <Action title="Reload" icon={Icon.ArrowClockwise} shortcut={RELOAD} onAction={load} />
      </ActionPanel>
    }>
      {downloads !== null && downloads.length === 0 && (
        <List.EmptyView
          icon={Icon.Folder}
          title="Nothing in this folder"
          description="When something is downloaded it shows up here, newest first."
        />
      )}
      {(downloads ?? []).map((download) => (
        <List.Item
          key={download.path}
          icon={{ fileIcon: download.path }}
          title={download.name}
          subtitle={download.isDirectory ? "Folder" : formatSize(download.size)}
          keywords={[
            download.isDirectory ? "folder" : "file",
            formatSize(download.size),
            download.modifiedAt.toLocaleDateString(),
          ]}
          accessories={[
            { text: download.modifiedAt.toLocaleString() },
            { text: folder, tooltip: "Downloaded into" },
          ]}
          actions={
            <ActionPanel>
              <Action.Open
                title={download.isDirectory ? "Open Folder" : "Open"}
                target={download.path}
                shortcut={{ modifiers: ["cmd"], key: "enter" }}
              />
              <Action.ShowInFinder
                title="Show in File Manager"
                path={download.path}
                shortcut={{ modifiers: ["cmd"], key: "o" }}
                select
              />
              <Action.OpenWith title="Open With" path={download.path} />
              <Action
                title="Copy File"
                icon={Icon.CopyClipboard}
                shortcut={{ modifiers: ["cmd"], key: "c" }}
                onAction={async () => {
                  // Action.CopyToClipboard takes a string only; Clipboard.copy
                  // is the one that accepts a file.
                  await Clipboard.copy({ file: download.path });
                  await showHUD("File copied to clipboard");
                }}
              />
              <Action.CopyToClipboard
                title="Copy Path"
                content={download.path}
                shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
              />
              <Action
                title="Move to Trash"
                icon={Icon.Trash}
                style={Action.Style.Destructive}
                shortcut={{ modifiers: ["cmd"], key: "backspace" }}
                onAction={() => trash(download)}
              />
              <Action
                title="Delete Permanently"
                icon={Icon.MinusCircle}
                shortcut={{ modifiers: ["cmd", "shift"], key: "backspace" }}
                onAction={() => destroy(download)}
              />
              <Action title="Reload" icon={Icon.ArrowClockwise} shortcut={RELOAD} onAction={load} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
