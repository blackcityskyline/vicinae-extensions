import {
  Action,
  ActionPanel,
  Alert,
  Detail,
  Icon,
  List,
  Toast,
  closeMainWindow,
  confirmAlert,
  getPreferenceValues,
  showToast,
} from "@vicinae/api";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  collect,
  humanBytes,
  humanElapsed,
  nameOf,
  order,
  percent,
  readIo,
  type CpuSample,
  type ProcessInfo,
  type SortBy,
} from "~/proc";

type Settings = {
  refreshMs: number;
  limit: number;
  showSystem: boolean;
  showPid: boolean;
  showPath: boolean;
  searchInPaths: boolean;
  searchInPid: boolean;
  closeAfterKill: boolean;
  clearSearchAfterKill: boolean;
  sort: SortBy;
};

function settings(): Settings {
  const prefs = getPreferenceValues<Preferences>();
  const refresh = Number(prefs["refresh-interval"]);
  const limit = Number(prefs["process-limit"]);
  return {
    refreshMs: Number.isFinite(refresh) && refresh > 0 ? refresh : 2000,
    limit: Number.isFinite(limit) && limit > 0 ? limit : 100,
    showSystem: prefs["show-system-processes"] === true,
    showPid: prefs["show-pid"] === true,
    showPath: prefs["show-path"] === true,
    searchInPaths: prefs["search-in-paths"] === true,
    searchInPid: prefs["search-in-pid"] === true,
    closeAfterKill: prefs["close-window-after-kill"] === true,
    clearSearchAfterKill: prefs["clear-search-after-kill"] === true,
    sort: prefs["sort-by-memory"] === true ? "memory" : "cpu",
  };
}

function messageOf(caught: unknown): string {
  return caught instanceof Error ? caught.message : String(caught);
}

/** Never ours to signal: init, and the two processes this extension lives in. */
const PROTECTED = new Set([1, process.pid, process.ppid]);

/**
 * btop's Program column is `/proc/<pid>/comm` — the kernel's short name, which
 * is the same `electron` eight times — so the row carries the Command column
 * beside it: without the argv there is no telling those eight apart.
 */
function subtitleOf(row: ProcessInfo, config: Settings): string {
  const parts: string[] = [];
  if (config.showPid) parts.push(`PID ${row.pid}`);
  if (row.user !== "") parts.push(row.user);
  parts.push(config.showPath && row.path !== "" ? row.path : row.command);
  return parts.join(" · ");
}

function keywordsOf(row: ProcessInfo, config: Settings): string[] {
  const words = [row.name, row.command];
  if (config.searchInPid) words.push(String(row.pid));
  if (config.searchInPaths && row.path !== "") words.push(row.path);
  return words;
}

export default function ProcessesCommand() {
  const [config] = useState(settings);
  const [rows, setRows] = useState<ProcessInfo[]>([]);
  const [sort, setSort] = useState<SortBy>(config.sort);
  const [searchText, setSearchText] = useState("");
  const [reloads, setReloads] = useState(0);
  const sample = useRef<CpuSample | null>(null);

  const refresh = () => setReloads((count) => count + 1);

  useEffect(() => {
    let cancelled = false;
    const read = () => {
      try {
        const snapshot = collect(sample.current);
        sample.current = snapshot.sample;
        if (!cancelled) setRows(snapshot.processes);
      } catch (caught) {
        if (!cancelled) {
          void showToast({
            style: Toast.Style.Failure,
            title: "Could not read /proc",
            message: messageOf(caught),
          });
        }
      }
    };
    read();
    // The first sample has no predecessor, so every CPU share is zero until a
    // second one lands; half a second is enough for that to be a real rate.
    const quick = setTimeout(read, 500);
    const timer = setInterval(read, config.refreshMs);
    return () => {
      cancelled = true;
      clearTimeout(quick);
      clearInterval(timer);
    };
  }, [config.refreshMs, reloads]);

  async function signal(row: ProcessInfo, which: "SIGTERM" | "SIGKILL") {
    if (PROTECTED.has(row.pid)) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Not that one",
        message: `PID ${row.pid} is the launcher or the process it is running in.`,
      });
      return;
    }
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: which === "SIGKILL" ? `Force killing ${row.name}` : `Killing ${row.name}`,
      message: `PID ${row.pid}`,
    });
    try {
      process.kill(row.pid, which);
      toast.style = Toast.Style.Success;
      toast.title = which === "SIGKILL" ? "SIGKILL sent" : "SIGTERM sent";
      toast.message = `${row.name} (${row.pid})`;
      if (config.clearSearchAfterKill) setSearchText("");
      if (config.closeAfterKill) await closeMainWindow();
    } catch (caught) {
      toast.style = Toast.Style.Failure;
      toast.title = "Could not signal it";
      toast.message = messageOf(caught);
    }
  }

  async function forceKill(row: ProcessInfo) {
    const confirmed = await confirmAlert({
      title: `Force kill ${row.name}?`,
      message: `PID ${row.pid} gets SIGKILL: it cannot save, close its files or clean up.`,
      primaryAction: { title: "Force kill", style: Alert.ActionStyle.Destructive },
    });
    if (confirmed) await signal(row, "SIGKILL");
  }

  const visible = order(
    rows.filter((row) => config.showSystem || row.ppid !== 2),
    sort,
  ).slice(0, config.limit);
  const totalCpu = rows.reduce((sum, row) => sum + row.cpu, 0);
  const totalMem = rows.reduce((sum, row) => sum + row.memBytes, 0);

  return (
    <List
      isLoading={rows.length === 0}
      filtering={true}
      searchText={searchText}
      onSearchTextChange={setSearchText}
      searchBarPlaceholder="Filter by name, command, user, PID or path"
      navigationTitle="Process Manager"
      searchBarAccessory={
        <List.Dropdown
          tooltip="Sort By"
          value={sort}
          onChange={(value) => setSort(value === "memory" ? "memory" : "cpu")}
        >
          <List.Dropdown.Item title="CPU Usage" value="cpu" icon={Icon.Gauge} />
          <List.Dropdown.Item title="Memory Usage" value="memory" icon={Icon.MemoryStick} />
        </List.Dropdown>
      }
    >
      <List.Section
        title={`${visible.length} of ${rows.length} processes (CPU: ${percent(totalCpu)} · RAM: ${humanBytes(totalMem)})`}
      >
        {visible.map((row) => (
          <List.Item
            key={row.pid}
            title={row.name}
            subtitle={subtitleOf(row, config)}
            keywords={keywordsOf(row, config)}
            accessories={[
              { text: percent(row.cpu), icon: Icon.Gauge },
              { text: humanBytes(row.memBytes), icon: Icon.MemoryStick },
            ]}
            actions={
              <ActionPanel>
                <Action.Push
                  title="Show Details"
                  icon={Icon.Info01}
                  target={
                    <ProcessDetail
                      row={row}
                      onKill={() => signal(row, "SIGTERM")}
                      onForceKill={() => forceKill(row)}
                    />
                  }
                />
                <SignalActions
                  row={row}
                  onKill={() => signal(row, "SIGTERM")}
                  onForceKill={() => forceKill(row)}
                />
                <Action.CopyToClipboard
                  title="Copy PID"
                  content={String(row.pid)}
                  shortcut={{ modifiers: ["ctrl", "shift"], key: "i" }}
                />
                {row.path !== "" ? (
                  <Action.CopyToClipboard
                    title="Copy Path"
                    content={row.path}
                    shortcut="copy-path"
                  />
                ) : null}
                <Action
                  title="Reload"
                  icon={Icon.ArrowClockwise}
                  shortcut="refresh"
                  onAction={refresh}
                />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}

/** Kill and Force Kill, shared by the row panel and the detail view. */
function SignalActions(props: {
  row: ProcessInfo;
  onKill: () => void;
  onForceKill: () => void;
}) {
  return (
    <>
      <Action
        title="Kill"
        icon={Icon.Xmark}
        shortcut={{ modifiers: ["ctrl"], key: "k" }}
        onAction={props.onKill}
      />
      <Action
        title="Force Kill"
        icon={Icon.BoltDisabled}
        shortcut={{ modifiers: ["ctrl", "shift"], key: "k" }}
        style="destructive"
        onAction={props.onForceKill}
      />
    </>
  );
}

/** btop's detailed panel: the fields it puts beside the command, in its order. */
function ProcessDetail(props: {
  row: ProcessInfo;
  onKill: () => void;
  onForceKill: () => void;
}): ReactNode {
  const { row } = props;
  const [io] = useState(() => readIo(row.pid));
  const [parent] = useState(() => nameOf(row.ppid));

  return (
    <Detail
      navigationTitle={`${row.name} (${row.pid})`}
      markdown={`# ${row.name}\n\n\`\`\`\n${row.command}\n\`\`\``}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label title="Status" text={row.state} />
          <Detail.Metadata.Label title="Elapsed" text={humanElapsed(row.elapsed)} />
          <Detail.Metadata.Separator />
          <Detail.Metadata.Label title="CPU" text={percent(row.cpu)} />
          <Detail.Metadata.Label title="Memory" text={humanBytes(row.memBytes)} />
          <Detail.Metadata.Label
            title="I/O read"
            text={io === null ? "Not readable" : humanBytes(io.read)}
          />
          <Detail.Metadata.Label
            title="I/O write"
            text={io === null ? "Not readable" : humanBytes(io.write)}
          />
          <Detail.Metadata.Separator />
          <Detail.Metadata.Label
            title="Parent"
            text={parent === "" ? String(row.ppid) : `${parent} (${row.ppid})`}
          />
          <Detail.Metadata.Label title="User" text={row.user === "" ? "Unknown" : row.user} />
          <Detail.Metadata.Label title="Threads" text={String(row.threads)} />
          <Detail.Metadata.Label title="Nice" text={String(row.nice)} />
          {row.path !== "" ? <Detail.Metadata.Label title="Path" text={row.path} /> : null}
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          <SignalActions
            row={row}
            onKill={props.onKill}
            onForceKill={props.onForceKill}
          />
          <Action.CopyToClipboard
            title="Copy PID"
            content={String(row.pid)}
            shortcut={{ modifiers: ["ctrl", "shift"], key: "i" }}
          />
          {row.path !== "" ? (
            <Action.CopyToClipboard
              title="Copy Path"
              content={row.path}
              shortcut="copy-path"
            />
          ) : null}
        </ActionPanel>
      }
    />
  );
}
