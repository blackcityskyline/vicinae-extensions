import {
  Action,
  ActionPanel,
  Alert,
  Detail,
  Form,
  Icon,
  List,
  Toast,
  confirmAlert,
  showToast,
  useNavigation,
} from "@vicinae/api";
import { useEffect, useState } from "react";
import {
  listTorrents,
  pauseTorrent,
  playTorrent,
  removeTorrent,
  resumeTorrent,
  setTorrServerStorage,
  torrServerHealth,
  torrServerStorage,
  turnOffTorrServerStorage,
  type TorrServerHealth,
  type TorrServerStorage,
  type Torrent,
} from "~/api/doris";
import { dorisBinary } from "~/preferences";
import { runService, type ServiceAction } from "~/torrserver-service";
import {
  escapeMarkdown,
  fileListMarkdown,
  isRunning,
  torrentSubtitle,
} from "~/utils/format";

function messageOf(caught: unknown): string {
  return caught instanceof Error ? caught.message : String(caught);
}

export default function TorrentsCommand() {
  const bin = dorisBinary();
  const [torrents, setTorrents] = useState<Torrent[] | null>(null);
  const [health, setHealth] = useState<TorrServerHealth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);
  const reload = () => setReloads((count) => count + 1);

  useEffect(() => {
    let cancelled = false;
    setTorrents(null);
    setError(null);
    listTorrents(bin)
      .then((held) => {
        if (!cancelled) setTorrents(held);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(messageOf(caught));
      });
    return () => {
      cancelled = true;
    };
  }, [bin, reloads]);

  // The URL lives in doris's own health answer, so a TorrServer moved to
  // another host is still linked to the right place. A failure here costs the
  // Web UI action, not the list.
  useEffect(() => {
    let cancelled = false;
    setHealth(null);
    torrServerHealth(bin)
      .then((found) => {
        if (!cancelled) setHealth(found);
      })
      .catch(() => {
        // No health answer: no URL to open, and the list still shows.
      });
    return () => {
      cancelled = true;
    };
  }, [bin, reloads]);

  const emptyActions = (
    <ActionPanel>
      <Action
        title="Retry"
        icon={Icon.ArrowClockwise}
        shortcut="refresh"
        onAction={reload}
      />
      <ServiceActions health={health} onRefresh={reload} />
    </ActionPanel>
  );

  return (
    <List
      isLoading={torrents === null && error === null}
      navigationTitle="TorrServer"
      searchBarPlaceholder={
        torrents && torrents.length > 0
          ? `${torrents.length} held · Enter plays, ctrl+shift+p pauses`
          : "Asking TorrServer what it is holding…"
      }
    >
      {error ? (
        <List.EmptyView
          icon={Icon.Warning}
          title="TorrServer is unreachable"
          description={`${error}\n\nStart it below, or point doris at another one with doris config set torrserver_url http://host:port.`}
          actions={emptyActions}
        />
      ) : torrents && torrents.length === 0 ? (
        <List.EmptyView
          icon={Icon.Cloud}
          title="TorrServer is holding nothing"
          description="Play a search result, or add a magnet with doris torrent add <link> in a terminal."
          actions={emptyActions}
        />
      ) : (
        (torrents ?? []).map((torrent) => (
          <TorrentItem
            key={torrent.hash}
            torrent={torrent}
            health={health}
            onRefresh={reload}
          />
        ))
      )}
    </List>
  );
}

function TorrentItem(props: {
  torrent: Torrent;
  health: TorrServerHealth | null;
  onRefresh: () => void;
}) {
  const { torrent } = props;
  const bin = dorisBinary();
  const running = isRunning(torrent.status);

  async function startStream() {
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Starting mpv",
      message: torrent.name,
    });
    try {
      await playTorrent(bin, torrent.hash);
      toast.style = Toast.Style.Success;
      toast.title = "Playing in mpv";
      toast.message = torrent.name;
    } catch (caught) {
      toast.style = Toast.Style.Failure;
      toast.title = "Could not start the stream";
      toast.message = messageOf(caught);
    }
  }

  async function setPaused(pause: boolean) {
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: pause ? "Pausing" : "Resuming",
      message: torrent.name,
    });
    try {
      if (pause) await pauseTorrent(bin, torrent.hash);
      else await resumeTorrent(bin, torrent.hash);
      toast.style = Toast.Style.Success;
      toast.title = pause ? "Paused" : "Resumed";
      toast.message = torrent.name;
      props.onRefresh();
    } catch (caught) {
      toast.style = Toast.Style.Failure;
      toast.title = pause ? "Could not pause it" : "Could not resume it";
      toast.message = messageOf(caught);
    }
  }

  async function remove() {
    const confirmed = await confirmAlert({
      title: "Remove this torrent?",
      message: `${torrent.name}\n\nIt leaves TorrServer's list; what was already fetched stays on disk.`,
      primaryAction: { title: "Remove", style: Alert.ActionStyle.Destructive },
    });
    if (!confirmed) return;
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Removing",
      message: torrent.name,
    });
    try {
      await removeTorrent(bin, torrent.hash);
      toast.style = Toast.Style.Success;
      toast.title = "Removed";
      toast.message = torrent.name;
      props.onRefresh();
    } catch (caught) {
      toast.style = Toast.Style.Failure;
      toast.title = "Could not remove it";
      toast.message = messageOf(caught);
    }
  }

  return (
    <List.Item
      title={torrent.name}
      subtitle={torrentSubtitle(torrent)}
      icon={running ? Icon.Download : Icon.Pause}
      keywords={[torrent.hash, torrent.status]}
      actions={
        <ActionPanel>
          <Action title="Play in mpv" icon={Icon.Play} onAction={startStream} />
          {running ? (
            <Action
              title="Pause"
              icon={Icon.Pause}
              shortcut={{ modifiers: ["ctrl", "shift"], key: "p" }}
              onAction={() => setPaused(true)}
            />
          ) : (
            <Action
              title="Resume"
              icon={Icon.Play}
              shortcut={{ modifiers: ["ctrl", "shift"], key: "r" }}
              onAction={() => setPaused(false)}
            />
          )}
          <Action.Push
            title="Show Files"
            icon={Icon.BlankDocument}
            shortcut={{ modifiers: ["ctrl", "shift"], key: "f" }}
            target={<TorrentFiles torrent={torrent} />}
          />
          <Action
            title="Remove from TorrServer"
            icon={Icon.Trash}
            shortcut="remove"
            style="destructive"
            onAction={remove}
          />
          <Action
            title="Refresh"
            icon={Icon.ArrowClockwise}
            shortcut="refresh"
            onAction={props.onRefresh}
          />
          <ServiceActions health={props.health} onRefresh={props.onRefresh} />
        </ActionPanel>
      }
    />
  );
}

function TorrentFiles(props: { torrent: Torrent }) {
  return (
    <Detail
      navigationTitle={props.torrent.name}
      markdown={fileListMarkdown(props.torrent.name, props.torrent.files)}
    />
  );
}

/**
 * The service itself. doris has no CLI verb for it — its TUI runs
 * `systemctl start torrserver.service` from the settings switch — so that one
 * measured command is what these actions run, through `sudo -n`.
 */
function ServiceActions(props: {
  health: TorrServerHealth | null;
  onRefresh: () => void;
}) {
  const visible = props.health !== null;
  const reachable = props.health?.reachable === true;

  // `systemctl start` returns as soon as the unit is active, which is before
  // TorrServer answers; asking it too early would show "unreachable" over a
  // server that is fine. Bounded: it only runs on a click, and gives up.
  async function waitUntilAnswering() {
    for (let attempt = 0; attempt < 12; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      try {
        if ((await torrServerHealth(dorisBinary())).reachable) return;
      } catch {
        return;
      }
    }
  }

  async function act(action: ServiceAction) {
    if (action === "stop") {
      const confirmed = await confirmAlert({
        title: "Stop TorrServer?",
        message:
          "Anything streaming through it stops, and `torrents` cannot list or play until it is started again.",
        primaryAction: { title: "Stop", style: Alert.ActionStyle.Destructive },
      });
      if (!confirmed) return;
    }
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: {
        start: "Starting TorrServer",
        stop: "Stopping TorrServer",
        restart: "Restarting TorrServer",
      }[action],
      message: "systemctl torrserver.service",
    });
    try {
      await runService(action);
      toast.style = Toast.Style.Success;
      toast.title = {
        start: "TorrServer is up",
        stop: "TorrServer is stopped",
        restart: "TorrServer restarted",
      }[action];
      toast.message = props.health?.url ?? "";
      if (action !== "stop") await waitUntilAnswering();
      props.onRefresh();
    } catch (caught) {
      toast.style = Toast.Style.Failure;
      toast.title = "systemctl refused";
      toast.message = messageOf(caught);
    }
  }

  return (
    <>
      {visible && !reachable ? (
        <Action
          title="Start TorrServer"
          icon={Icon.Power}
          shortcut={{ modifiers: ["ctrl", "shift"], key: "s" }}
          onAction={() => act("start")}
        />
      ) : null}
      {visible && props.health?.url ? (
        <Action.OpenInBrowser
          title="Open TorrServer Web UI"
          icon={Icon.Globe01}
          shortcut="open"
          url={props.health.url}
        />
      ) : null}
      {reachable ? (
        <Action.Push
          title="Storage"
          icon={Icon.HardDrive}
          shortcut={{ modifiers: ["ctrl", "shift"], key: "g" }}
          target={<StorageForm onRefresh={props.onRefresh} />}
        />
      ) : null}
      {visible ? (
        <>
          <Action
            title="Restart TorrServer"
            icon={Icon.ArrowCounterClockwise}
            shortcut={{ modifiers: ["ctrl", "shift"], key: "t" }}
            onAction={() => act("restart")}
          />
          <Action
            title="Stop TorrServer"
            icon={Icon.Stop}
            shortcut={{ modifiers: ["ctrl", "shift"], key: "q" }}
            style="destructive"
            onAction={() => act("stop")}
          />
        </>
      ) : null}
    </>
  );
}

/** Reading and writing what `doris torrent storage show|set|off` manages. */
function StorageForm(props: { onRefresh: () => void }) {
  const bin = dorisBinary();
  const navigation = useNavigation();
  const [storage, setStorage] = useState<TorrServerStorage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [path, setPath] = useState("");
  const [keepCache, setKeepCache] = useState(false);

  useEffect(() => {
    let cancelled = false;
    torrServerStorage(bin)
      .then((found) => {
        if (cancelled) return;
        setStorage(found);
        setPath(found.path);
        setKeepCache(found.keepCache);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(messageOf(caught));
      });
    return () => {
      cancelled = true;
    };
  }, [bin]);

  async function save() {
    const wanted = path.trim();
    if (wanted === "") {
      await showToast({
        style: Toast.Style.Failure,
        title: "Give a directory",
        message: "doris writes the path as typed; it has no empty default to fall back on.",
      });
      return false;
    }
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Pointing TorrServer at it",
      message: wanted,
    });
    try {
      const now = await setTorrServerStorage(bin, wanted, keepCache);
      toast.style = Toast.Style.Success;
      toast.title = "Storage saved";
      toast.message = now.keepCache
        ? "Kept after the last reader leaves"
        : "Dropped 30 s after the last reader leaves";
      navigation.pop();
      props.onRefresh();
    } catch (caught) {
      toast.style = Toast.Style.Failure;
      toast.title = "TorrServer refused";
      toast.message = messageOf(caught);
      return false;
    }
    return true;
  }

  async function turnOff() {
    const confirmed = await confirmAlert({
      title: "Stop caching to disk?",
      message:
        "TorrServer clears the save path with it, and drops what it already fetched as its readers leave.",
      primaryAction: { title: "Stop caching", style: Alert.ActionStyle.Destructive },
    });
    if (!confirmed) return;
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Turning disk caching off",
    });
    try {
      const now = await turnOffTorrServerStorage(bin);
      toast.style = Toast.Style.Success;
      toast.title = "Disk caching is off";
      toast.message = now.path || "The server uses its own directory";
      setPath(now.path);
      setKeepCache(now.keepCache);
      props.onRefresh();
    } catch (caught) {
      toast.style = Toast.Style.Failure;
      toast.title = "TorrServer refused";
      toast.message = messageOf(caught);
    }
  }

  if (error) {
    return (
      <Detail
        navigationTitle="TorrServer Storage"
        markdown={`# TorrServer storage\n\n${escapeMarkdown(error)}`}
      />
    );
  }

  return (
    <Form
      navigationTitle="TorrServer Storage"
      isLoading={storage === null}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Save" icon={Icon.Checkmark} onSubmit={save} />
          <Action
            title="Stop Caching to Disk"
            icon={Icon.Stop}
            shortcut={{ modifiers: ["ctrl", "shift"], key: "o" }}
            style="destructive"
            onAction={turnOff}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="path"
        title="Download Path"
        placeholder="/home/you/Torrents"
        value={path}
        onChange={setPath}
      />
      <Form.Checkbox
        id="keepCache"
        title="Cache"
        label="Keep what was fetched after the last reader leaves"
        value={keepCache}
        onChange={setKeepCache}
      />
      <Form.Description text="Absolute path: the server writes there as it streams." />
      <Form.Description text="Stopping disk caching clears the path and drops what was already fetched as its readers leave; it cannot be undone from here." />
    </Form>
  );
}
