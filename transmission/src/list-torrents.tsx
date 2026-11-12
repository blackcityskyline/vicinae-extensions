import { Action, ActionPanel, Alert, confirmAlert, Icon, List, showToast, Toast } from "@vicinae/api";
import { useEffect, useMemo, useState } from "react";

import { makeClient, remove, setStopped, torrents, webUrl, type Torrent } from "~/api/rpc";
import { AddTorrentForm } from "~/components/add-torrent-form";
import { connection } from "~/preferences";
import { bytes, eta, percent, ratio, speed, statusLabel } from "~/utils/format";

/** The daemon is local and cheap to poll; three seconds is what a torrent client feels like. */
const POLL_MS = 3000;

const FILTERS = [
  { value: "all", title: "All torrents" },
  { value: "active", title: "Active" },
  { value: "downloading", title: "Downloading" },
  { value: "seeding", title: "Seeding" },
  { value: "stopped", title: "Stopped" },
  { value: "error", title: "With problems" },
];

function matches(torrent: Torrent, filter: string): boolean {
  switch (filter) {
    case "active":
      return torrent.status !== 0;
    case "downloading":
      return torrent.status >= 1 && torrent.status <= 4;
    case "seeding":
      return torrent.status === 5 || torrent.status === 6;
    case "stopped":
      return torrent.status === 0;
    case "error":
      return torrent.error !== 0;
    default:
      return true;
  }
}

/** Moving torrents first, then the ones that are done, then whatever is parked. */
function rank(torrent: Torrent): number {
  if (torrent.error !== 0) return 0;
  if (torrent.status >= 1 && torrent.status <= 4) return 1;
  if (torrent.status === 5 || torrent.status === 6) return 2;
  return 3;
}

function iconOf(torrent: Torrent) {
  if (torrent.error !== 0) return Icon.Exclamationmark;
  if (torrent.percentDone >= 1) return torrent.status === 6 ? Icon.ArrowUp : Icon.Checkmark;
  if (torrent.status === 4) return Icon.Download;
  if (torrent.status === 0) return Icon.Pause;
  return Icon.Dot;
}

/** The detail pane, in the order a person checks a torrent: state, then numbers. */
function TorrentDetail({ torrent }: { torrent: Torrent }) {
  const done = torrent.sizeWhenDone - torrent.leftUntilDone;
  return (
    <List.Item.Detail
      metadata={
        <List.Item.Detail.Metadata>
          <List.Item.Detail.Metadata.Label title="Status" text={statusLabel(torrent.status, torrent.percentDone)} />
          <List.Item.Detail.Metadata.Label title="Progress" text={percent(torrent.percentDone)} />
          <List.Item.Detail.Metadata.Label title="Size" text={bytes(torrent.sizeWhenDone)} />
          <List.Item.Detail.Metadata.Label title="Done" text={bytes(done)} />
          <List.Item.Detail.Metadata.Separator />
          <List.Item.Detail.Metadata.Label title="Down" text={speed(torrent.rateDownload)} />
          <List.Item.Detail.Metadata.Label title="Up" text={speed(torrent.rateUpload)} />
          <List.Item.Detail.Metadata.Label title="ETA" text={eta(torrent.eta)} />
          <List.Item.Detail.Metadata.Label title="Ratio" text={ratio(torrent.uploadRatio)} />
          <List.Item.Detail.Metadata.Separator />
          <List.Item.Detail.Metadata.Label title="Directory" text={torrent.downloadDir} />
          <List.Item.Detail.Metadata.Label title="Added" text={new Date(torrent.addedDate * 1000).toLocaleString()} />
          {torrent.errorString === "" ? null : (
            <List.Item.Detail.Metadata.Label title="Error" text={torrent.errorString} />
          )}
        </List.Item.Detail.Metadata>
      }
    />
  );
}

export default function ListTorrents() {
  const client = useMemo(() => makeClient(connection()), []);
  const [items, setItems] = useState<Torrent[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const page = await torrents(client);
        if (!live) return;
        setItems(page.torrents);
        setProblem(null);
      } catch (error) {
        if (!live) return;
        setProblem(error instanceof Error ? error.message : String(error));
      }
    };
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [client, reload]);

  async function change(ids: number[], stopped: boolean): Promise<void> {
    try {
      await setStopped(client, ids, stopped);
      setReload((count) => count + 1);
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: stopped ? "Could not stop the torrent" : "Could not start the torrent",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function drop(torrent: Torrent, deleteData: boolean): Promise<void> {
    if (deleteData) {
      const confirmed = await confirmAlert({
        title: `Delete “${torrent.name}” and its files?`,
        message: "This removes the downloaded files from disk. It cannot be undone.",
        primaryAction: { title: "Delete", style: Alert.ActionStyle.Destructive },
        dismissAction: { title: "Cancel", style: Alert.ActionStyle.Cancel },
      });
      if (!confirmed) return;
    }

    try {
      await remove(client, [torrent.id], deleteData);
      setReload((count) => count + 1);
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Could not remove the torrent",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const shown = (items ?? [])
    .filter((torrent) => matches(torrent, filter))
    .sort((left, right) => rank(left) - rank(right) || left.name.localeCompare(right.name));

  return (
    <List
      isLoading={items === null && problem === null}
      navigationTitle="Transmission"
      searchBarPlaceholder="Filter torrents"
      searchBarAccessory={
        <List.Dropdown tooltip="Show" storeValue value={filter} onChange={setFilter}>
          {FILTERS.map((entry) => (
            <List.Dropdown.Item key={entry.value} title={entry.title} value={entry.value} />
          ))}
        </List.Dropdown>
      }
    >
      {problem === null ? null : (
        <List.EmptyView
          icon={Icon.Exclamationmark}
          title="Cannot reach the daemon"
          description={problem}
          actions={
            <ActionPanel>
              <Action
                title="Try Again"
                icon={Icon.ArrowClockwise}
                shortcut="refresh"
                onAction={() => setReload((count) => count + 1)}
              />
              <Action.Push
                icon={Icon.Plus}
                title="Add Torrent"
                shortcut="new"
                target={<AddTorrentForm onAdded={() => setReload((count) => count + 1)} />}
              />
            </ActionPanel>
          }
        />
      )}
      {problem === null && items !== null && shown.length === 0 ? (
        <List.EmptyView
          title={filter === "all" ? "No torrents" : "Nothing matches this filter"}
          description={filter === "all" ? "Add a magnet link to get started." : "Try another filter."}
          actions={
            <ActionPanel>
              <Action.Push
                icon={Icon.Plus}
                title="Add Torrent"
                shortcut="new"
                target={<AddTorrentForm onAdded={() => setReload((count) => count + 1)} />}
              />
            </ActionPanel>
          }
        />
      ) : null}
      {shown.map((torrent) => (
        <List.Item
          key={torrent.id}
          title={torrent.name}
          subtitle={`${statusLabel(torrent.status, torrent.percentDone)} · ${percent(torrent.percentDone)} · ${speed(
            torrent.rateDownload,
          )}`}
          icon={iconOf(torrent)}
          keywords={[torrent.hashString, torrent.downloadDir]}
          accessories={
            torrent.error !== 0
              ? [{ tag: { value: "Error" } }]
              : [{ text: `${percent(torrent.percentDone)} · ${bytes(torrent.sizeWhenDone)}` }]
          }
          detail={<TorrentDetail torrent={torrent} />}
          actions={
            <ActionPanel>
              {torrent.status === 0 ? (
                <Action
                  title="Start"
                  icon={Icon.Play}
                  shortcut={{ modifiers: ["ctrl"], key: "s" }}
                  onAction={() => void change([torrent.id], false)}
                />
              ) : (
                <Action
                  title="Stop"
                  icon={Icon.Pause}
                  shortcut={{ modifiers: ["ctrl"], key: "s" }}
                  onAction={() => void change([torrent.id], true)}
                />
              )}
              <Action.Push
                icon={Icon.Plus}
                title="Add Torrent"
                shortcut="new"
                target={<AddTorrentForm onAdded={() => setReload((count) => count + 1)} />}
              />
              <Action.CopyToClipboard title="Copy Magnet Link" content={torrent.magnetLink} shortcut="copy" />
              <Action.OpenInBrowser title="Open Web Interface" url={webUrl(connection())} shortcut="open" />
              <Action
                title="Refresh"
                icon={Icon.ArrowClockwise}
                shortcut="refresh"
                onAction={() => setReload((count) => count + 1)}
              />
              <ActionPanel.Section>
                <Action.Open
                  title="Open Download Directory"
                  target={torrent.downloadDir}
                  icon={Icon.Folder}
                  shortcut={{ modifiers: ["ctrl", "shift"], key: "o" }}
                />
                <Action
                  title="Remove Torrent"
                  icon={Icon.Trash}
                  shortcut="remove"
                  onAction={() => void drop(torrent, false)}
                />
                <Action
                  title="Remove Torrent and Delete Files"
                  icon={Icon.Trash}
                  style="destructive"
                  shortcut="remove-all"
                  onAction={() => void drop(torrent, true)}
                />
              </ActionPanel.Section>
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
