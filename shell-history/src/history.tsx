import {
  Action,
  ActionPanel,
  Clipboard,
  getPreferenceValues,
  Icon,
  List,
  popToRoot,
  showHUD,
  showToast,
  Toast,
} from "@vicinae/api";
import { useEffect, useMemo, useState } from "react";

import { HISTORY_PATHS, readHistory } from "~/api/history";
import { runInTerminal } from "~/api/terminal";
import { maskSecrets, type Entry, type Shell } from "~/utils/history";
import { formatTimestamp, type DateFormat } from "~/utils/time";

const SHELLS: Shell[] = ["bash", "fish", "zsh"];
const ALL = "all";

const ICONS: Record<Shell | typeof ALL, Icon> = {
  all: Icon.CheckList,
  bash: Icon.Terminal,
  fish: Icon.Terminal,
  zsh: Icon.Terminal,
};

type Row = Entry & { display: string; stamp: string };
export default function SearchHistory() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [missing, setMissing] = useState<Shell[]>([]);
  const [shell, setShell] = useState<string>(ALL);
  const [error, setError] = useState("");
  const preferences = getPreferenceValues<Preferences>();
  const [terminal] = useState(preferences.terminal || "auto");
  const [dateFormat] = useState<DateFormat>(preferences.dateFormat || "dotted");
  const [maxEntries] = useState(Number(preferences.maxEntries) || 1000);

  function load() {
    setRows(null);
    readHistory(maxEntries).then((result) => {
      if (result.ok) {
        setRows(toRows(result.value, dateFormat));
        setMissing(result.missing);
      } else {
        setError(result.message);
      }
    });
  }

  useEffect(load, []);

  // One pass over the entries instead of two regexes per row per render.
  function toRows(entries: Entry[], format: DateFormat): Row[] {
    return entries.map((entry) => ({
      ...entry,
      display: maskSecrets(entry.command),
      stamp: formatTimestamp(entry.when, format),
    }));
  }

  const shown = useMemo(
    () => (rows ?? []).filter((row) => shell === ALL || row.shell === shell),
    [rows, shell],
  );

  if (error) {
    return (
      <List.EmptyView
        icon={Icon.Warning}
        title="History could not be read"
        description={`${error}\n\nThese files are read directly: ${SHELLS.map((s) => HISTORY_PATHS[s]).join(", ")}`}
      />
    );
  }

  return (
    <List
      isLoading={rows === null}
      searchBarPlaceholder="Search command history"
      searchBarAccessory={
        <List.Dropdown tooltip="Shell" value={shell} onChange={setShell} storeValue>
          <List.Dropdown.Item title="All shells" value={ALL} />
          {SHELLS.map((name) => (
            <List.Dropdown.Item key={name} title={name} value={name} />
          ))}
        </List.Dropdown>
      }
    >
      {rows !== null && shown.length === 0 && (
        <List.EmptyView
          icon={Icon.Terminal}
          title={shell === ALL ? "No history yet" : `No ${shell} history`}
          description={
            missing.length === 0
              ? "Commands you run appear here as soon as your shell writes its history file."
              : `Not found: ${missing.map((name) => HISTORY_PATHS[name]).join(", ")}`
          }
        />
      )}
      {shown.map((entry, index) => (
        <List.Item
          key={`${entry.shell}-${entry.when ?? "no-time"}-${index}`}
          icon={ICONS[entry.shell]}
          title={entry.display}
          subtitle={entry.shell}
          keywords={[entry.command, entry.shell, entry.stamp]}
          accessories={[{ text: entry.stamp }, { text: entry.shell, tooltip: "Shell" }]}
          actions={
            <ActionPanel>
              {/* Enter: the command goes into whatever window you were in. */}
              <Action
                title="Paste into Focused Window"
                icon={Icon.EnterKey}
                onAction={async () => {
                  await Clipboard.paste(entry.command);
                  await showHUD("Pasted into the focused window");
                  await popToRoot();
                }}
              />
              <Action
                title="Copy Command"
                icon={Icon.CopyClipboard}
                shortcut={{ modifiers: ["ctrl"], key: "enter" }}
                onAction={async () => {
                  // The list masks secrets; what goes into a shell has to be the
                  // command that actually ran. Concealed keeps it out of the
                  // clipboard history, because it may hold a token.
                  await Clipboard.copy(entry.command, { concealed: true });
                  await showHUD("Copied to clipboard");
                }}
              />
              <Action
                title="Run in Terminal"
                icon={Icon.Terminal}
                shortcut={{ modifiers: ["ctrl"], key: "x" }}
                onAction={async () => {
                  const result = runInTerminal(terminal, entry.shell, entry.command);
                  if (!result.ok) {
                    showToast({ style: Toast.Style.Failure, title: "Terminal not started", message: result.message });
                    return;
                  }
                  await showHUD("Running in a terminal");
                  await popToRoot();
                }}
              />
              <Action.ShowInFinder
                title="Show History File"
                icon={Icon.Finder}
                path={HISTORY_PATHS[entry.shell]}
                select
                shortcut={{ modifiers: ["cmd"], key: "o" }}
              />
              <Action
                title="Reload"
                icon={Icon.ArrowClockwise}
                shortcut={{ modifiers: ["cmd"], key: "r" }}
                onAction={load}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
