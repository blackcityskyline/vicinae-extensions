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

const SHELLS: Shell[] = ["bash", "fish", "zsh"];
const ALL = "all";

const ICONS: Record<Shell | typeof ALL, Icon> = {
  all: Icon.CheckList,
  bash: Icon.Terminal,
  fish: Icon.Terminal,
  zsh: Icon.Terminal,
};

function when(entry: Entry): string {
  return entry.when === undefined ? "—" : new Date(entry.when).toLocaleString();
}

export default function SearchHistory() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [missing, setMissing] = useState<Shell[]>([]);
  const [shell, setShell] = useState<string>(ALL);
  const [error, setError] = useState("");
  const [terminal] = useState(() => getPreferenceValues<Preferences>().terminal || "auto");

  function load() {
    setEntries(null);
    readHistory().then((result) => {
      if (result.ok) {
        setEntries(result.value);
        setMissing(result.missing);
      } else {
        setError(result.message);
      }
    });
  }

  useEffect(load, []);

  const shown = useMemo(
    () => (entries ?? []).filter((entry) => shell === ALL || entry.shell === shell),
    [entries, shell],
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
      isLoading={entries === null}
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
      {entries !== null && shown.length === 0 && (
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
          title={maskSecrets(entry.command)}
          subtitle={entry.shell}
          keywords={[entry.command, entry.shell]}
          accessories={[{ text: when(entry) }, { text: entry.shell, tooltip: "Shell" }]}
          actions={
            <ActionPanel>
              <Action
                title="Copy Command"
                icon={Icon.CopyClipboard}
                shortcut={{ modifiers: ["cmd"], key: "c" }}
                onAction={async () => {
                  // The list masks secrets; what goes into a shell has to be the
                  // command that actually ran. Concealed keeps it out of the
                  // clipboard history, because it may hold a token.
                  await Clipboard.copy(entry.command, { concealed: true });
                  await showHUD("Copied");
                }}
              />
              <Action
                title="Run in Terminal"
                icon={Icon.Terminal}
                shortcut={{ modifiers: ["ctrl"], key: "enter" }}
                onAction={async () => {
                  const result = runInTerminal(terminal, entry.shell, entry.command);
                  if (!result.ok) {
                    showToast({ style: Toast.Style.Failure, title: "Terminal not started", message: result.message });
                    return;
                  }
                  await showHUD(`Running in a terminal`);
                  await popToRoot();
                }}
              />
              <Action
                title="Paste Command into Focused Window"
                icon={Icon.CopyClipboard}
                shortcut={{ modifiers: ["cmd"], key: "return" }}
                onAction={async () => {
                  await Clipboard.paste(entry.command);
                  await showHUD("Pasted into the focused window");
                  await popToRoot();
                }}
              />
              <Action.ShowInFinder
                title="Show History File"
                path={HISTORY_PATHS[entry.shell]}
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
