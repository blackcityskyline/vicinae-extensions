import { Action, ActionPanel, Alert, confirmAlert, Icon, List, showToast, Toast } from "@vicinae/api";
import { existsSync } from "node:fs";
import path from "node:path";
import { useEffect, useMemo, useState } from "react";

import { makeClient, remove, setStopped, torrents, webUrl, type Torrent, type TrackerStat } from "~/api/rpc";
import { AddTorrentForm } from "~/components/add-torrent-form";
import { TorrentConfiguration } from "~/components/torrent-configuration";
import { connection, listSettings } from "~/preferences";
import { bytes, eta, percent, ratio, speed, statusLabel } from "~/utils/format";
import { sortTorrents } from "~/utils/list";

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

function iconOf(torrent: Torrent) {
  if (torrent.error !== 0) return Icon.Exclamationmark;
  if (torrent.percentDone >= 1) return torrent.status === 6 ? Icon.ArrowUp : Icon.Checkmark;
  if (torrent.status === 4) return Icon.Download;
  if (torrent.status === 0) return Icon.Pause;
  return Icon.Dot;
}

/** The host is only meaningful when the daemon runs here; a remote one has no local files. */
function isLocal(host: string): boolean {
  return host === "" || host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function tierOf(torrent: Torrent, stat: TrackerStat): number | undefined {
  const tracker = torrent.trackers.find((candidate) => candidate.announce === stat.announce);
  return tracker === undefined ? undefined : tracker.tier + 1;
}

/** The detail pane, in the order a person checks a torrent: state, numbers, files, trackers. */
function TorrentDetail({ torrent, maxFiles }: { torrent: Torrent; maxFiles: number }) {
  const done = torrent.sizeWhenDone - torrent.leftUntilDone;
  const files = torrent.files.slice(0, maxFiles);

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
          <List.Item.Detail.Metadata.Label
            title="Pieces"
            text={`${torrent.pieceCount} × ${bytes(torrent.pieceSize)}`}
          />
          <List.Item.Detail.Metadata.Label title="Hash" text={torrent.hashString} />
          <List.Item.Detail.Metadata.Label title="Private" text={torrent.isPrivate ? "Yes" : "No"} />
          {torrent.creator === "" ? null : <List.Item.Detail.Metadata.Label title="Creator" text={torrent.creator} />}
          {torrent.dateCreated <= 0 ? null : (
            <List.Item.Detail.Metadata.Label
              title="Created"
              text={new Date(torrent.dateCreated * 1000).toLocaleDateString()}
            />
          )}
          {torrent.comment === "" ? null : <List.Item.Detail.Metadata.Label title="Comment" text={torrent.comment} />}
          {torrent.errorString === "" ? null : (
            <List.Item.Detail.Metadata.Label title="Error" text={torrent.errorString} icon={Icon.Exclamationmark} />
          )}
          {files.length === 0 ? null : <List.Item.Detail.Metadata.Separator />}
          {files.map((file) => (
            <List.Item.Detail.Metadata.Label
              key={file.name}
              title={file.name}
              text={`${percent(file.bytesCompleted / Math.max(1, file.length))} · ${bytes(file.length)}`}
            />
          ))}
          {torrent.files.length > maxFiles ? (
            <List.Item.Detail.Metadata.Label title="Files" text={`and ${torrent.files.length - maxFiles} more`} />
          ) : null}
          {torrent.trackerStats.length === 0 ? null : <List.Item.Detail.Metadata.Separator />}
          {torrent.trackerStats.map((stat) => {
            const tier = tierOf(torrent, stat);
            return (
              <List.Item.Detail.Metadata.Label
                key={stat.announce}
                title={stat.host}
                text={[tier === undefined ? undefined : `Tier ${tier}`, `S ${stat.seederCount}`, `L ${stat.leecherCount}`]
                  .filter(Boolean)
                  .join(" · ")}
              />
            );
          })}
        </List.Item.Detail.Metadata>
      }
    />
  );
}

export default function ListTorrents() {
  const settings = useMemo(() => listSettings(), []);
  const host = useMemo(() => connection().host, []);
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

  function refresh(): void {
    setReload((count) => count + 1);
  }

  async function change(ids: number[] | undefined, stopped: boolean): Promise<void> {
    try {
      await setStopped(client, ids, stopped);
      refresh();
      await showToast({
        style: Toast.Style.Success,
        title: ids === undefined ? (stopped ? "All torrents paused" : "All torrents resumed") : stopped ? "Torrent paused" : "Torrent resumed",
      });
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
      refresh();
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Could not remove the torrent",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /** Only a local daemon's files can be opened; a remote one's paths mean nothing here. */
  function downloaded(torrent: Torrent): Array<{ name: string; path: string }> {
    if (!isLocal(host)) return [];
    return torrent.files
      .slice(0, settings.maxFiles)
      .map((file) => ({ name: file.name, path: path.join(torrent.downloadDir, file.name) }))
      .filter((file) => existsSync(file.path));
  }

  const shown = sortTorrents(
    (items ?? []).filter((torrent) => matches(torrent, filter)),
    settings.by,
    settings.direction,
  );

  return (
    <List
      isLoading={items === null && problem === null}
      isShowingDetail
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
              <Action title="Try Again" icon={Icon.ArrowClockwise} shortcut="refresh" onAction={refresh} />
              <Action.Push
                icon={Icon.Plus}
                title="Add Torrent"
                shortcut="new"
                target={<AddTorrentForm onAdded={refresh} />}
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
                target={<AddTorrentForm onAdded={refresh} />}
              />
            </ActionPanel>
          }
        />
      ) : null}
      {shown.map((torrent) => {
        const openable = downloaded(torrent);
        return (
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
            detail={<TorrentDetail torrent={torrent} maxFiles={settings.maxFiles} />}
            actions={
              <ActionPanel>
                {openable.length === 0 ? null : openable.length === 1 ? (
                  <Action.OpenWith
                    title={`Open ${openable[0]?.name ?? "File"}`}
                    icon={Icon.Upload}
                    path={openable[0]?.path ?? ""}
                    shortcut="open"
                  />
                ) : (
                  <ActionPanel.Submenu title="Open Downloaded Files" icon={Icon.Upload} shortcut="open">
                    {openable.map((file, index) => (
                      <Action.OpenWith
                        key={file.path}
                        title={file.name}
                        path={file.path}
                        shortcut={
                          index < 9
                            ? { modifiers: ["ctrl"], key: String(index + 1) as "1" }
                            : undefined
                        }
                      />
                    ))}
                  </ActionPanel.Submenu>
                )}
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
                  target={<AddTorrentForm onAdded={refresh} />}
                />
                <Action.Push
                  icon={Icon.Cog}
                  title="Configuration"
                  shortcut="edit"
                  target={<TorrentConfiguration torrent={torrent} onSaved={refresh} />}
                />
                <Action.CopyToClipboard title="Copy Magnet Link" content={torrent.magnetLink} shortcut="copy" />
                <Action.OpenInBrowser
                  title="Open Web Interface"
                  url={webUrl(connection())}
                  shortcut={{ modifiers: ["ctrl", "shift"], key: "w" }}
                />
                <Action title="Refresh" icon={Icon.ArrowClockwise} shortcut="refresh" onAction={refresh} />
                <ActionPanel.Section>
                  <Action
                    title="Resume All"
                    icon={Icon.ArrowClockwise}
                    shortcut={{ modifiers: ["ctrl", "shift"], key: "s" }}
                    onAction={() => void change(undefined, false)}
                  />
                  <Action
                    title="Pause All"
                    icon={Icon.Pause}
                    shortcut={{ modifiers: ["ctrl", "shift"], key: "p" }}
                    onAction={() => void change(undefined, true)}
                  />
                </ActionPanel.Section>
                <ActionPanel.Section>
                  <Action.Open
                    title="Open Download Directory"
                    target={torrent.downloadDir}
                    icon={Icon.Folder}
                    shortcut={{ modifiers: ["ctrl", "shift"], key: "d" }}
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
        );
      })}
    </List>
  );
}
