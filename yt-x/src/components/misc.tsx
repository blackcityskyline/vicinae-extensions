import {
  Action,
  ActionPanel,
  Alert,
  Form,
  Icon,
  List,
  Toast,
  confirmAlert,
  showToast,
  useNavigation,
} from "@vicinae/api";
import { join } from "node:path";
import { useState } from "react";

import {
  clearSearchHistory,
  readCustomCommands,
  readSearchHistory,
  saveCustomCommand,
} from "~/api/library";
import { runInEditor, runInYtX } from "~/api/terminal";
import { attempt, succeeded } from "~/api/toast";
import { syncSubscriptions } from "~/api/ytdlp";
import { SearchView, VideoList } from "~/components/views";
import type { Config, CustomCommand } from "~/types";
import { DEFAULT_SP, searchUrl } from "~/utils/search";
import { splitWords } from "~/utils/shell-words";

type Shared = {
  config: Config;
  savedIds: ReadonlySet<string>;
  onSavedChange: (id: string, saved: boolean) => void;
};

const EXPLORE = [
  {
    title: "Explore Channels",
    sp: "EgIQAg%253D%253D",
    kind: "channels" as const,
    placeholder: "Search channels",
  },
  {
    title: "Explore Playlists",
    sp: "EgIQAw%253D%253D",
    kind: "playlists" as const,
    placeholder: "Search playlists",
  },
  {
    title: "Explore Shorts",
    sp: "EgIQCQ%253D%253D",
    kind: "videos" as const,
    placeholder: "Search shorts",
  },
  {
    title: "Explore Movies",
    sp: "EgIQBA%253D%253D",
    kind: "videos" as const,
    placeholder: "Search movies",
  },
];

function configFile(config: Config, name: string): string {
  return join(config.configDir, name);
}

/** yt-x's "Edit …": the configured editor, or the desktop's default app. */
function EditFileRow({
  config,
  path,
  title,
  subtitle,
}: {
  config: Config;
  path: string;
  title: string;
  subtitle: string;
}) {
  return (
    <List.Item
      title={title}
      subtitle={subtitle}
      icon={Icon.Pencil}
      actions={
        <ActionPanel>
          {config.editor ? (
            <Action
              title="Open in Editor"
              icon={Icon.Pencil}
              shortcut="open"
              onAction={() => void runInEditor(config.editor, path)}
            />
          ) : (
            <Action.Open title="Open File" icon={Icon.Pencil} shortcut="open" target={path} />
          )}
          <Action.CopyToClipboard title="Copy Path" content={path} shortcut="copy" />
        </ActionPanel>
      }
    />
  );
}

export function MiscMenu({ config, savedIds, onSavedChange }: Shared) {
  const mpvConfig = join(config.configHome, "mpv", "mpv.conf");
  const ytDlpConfig = join(config.configHome, "yt-dlp", "config");
  const historyFile = join(config.cacheDir, "search-history.txt");

  function sync(): void {
    void attempt("Could not sync the subscriptions", async () => {
      const confirmed = await confirmAlert({
        title: "Replace the local subscriptions?",
        message: `The channel list is rebuilt from YouTube and ${join(config.configDir, "my", "subscriptions.json")} is overwritten.`,
        primaryAction: { title: "Sync", style: Alert.ActionStyle.Destructive },
        dismissAction: { title: "Cancel", style: Alert.ActionStyle.Cancel },
      });
      if (!confirmed) return;

      const toast = await showToast(Toast.Style.Animated, "Syncing subscriptions");
      try {
        const count = await syncSubscriptions(config);
        toast.style = Toast.Style.Success;
        toast.title = "Subscriptions synced";
        toast.message = `${count} channels`;
      } catch (error) {
        toast.style = Toast.Style.Failure;
        toast.title = "Could not sync the subscriptions";
        toast.message = error instanceof Error ? error.message : String(error);
      }
    });
  }

  return (
    <List navigationTitle="Miscellaneous" searchBarPlaceholder="Filter actions">
      <List.Section title="Explore">
        {EXPLORE.map((explore) => (
          <List.Item
            key={explore.title}
            title={explore.title}
            icon={Icon.MagnifyingGlass}
            actions={
              <ActionPanel>
                <Action.Push
                  title={explore.title}
                  icon={Icon.MagnifyingGlass}
                  shortcut="open"
                  target={
                    <SearchView
                      title={explore.title}
                      placeholder={explore.placeholder}
                      kind={explore.kind}
                      sp={explore.sp}
                      config={config}
                      savedIds={savedIds}
                      onSavedChange={onSavedChange}
                    />
                  }
                />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
      <List.Section title="Search history">
        <List.Item
          title="Search History"
          subtitle="Search your past terms, edit or clear the file"
          icon={Icon.Clock}
          actions={
            <ActionPanel>
              <Action.Push
                title="Open Search History"
                icon={Icon.Clock}
                shortcut="open"
                target={<SearchHistory config={config} savedIds={savedIds} onSavedChange={onSavedChange} />}
              />
            </ActionPanel>
          }
        />
      </List.Section>
      <List.Section title="Custom commands">
        <List.Item
          title="Custom Commands"
          subtitle="URLs you saved in yt-x with their own yt-dlp options"
          icon={Icon.Terminal}
          actions={
            <ActionPanel>
              <Action.Push
                title="Open Custom Commands"
                icon={Icon.Terminal}
                shortcut="open"
                target={<CustomCommands config={config} savedIds={savedIds} onSavedChange={onSavedChange} />}
              />
            </ActionPanel>
          }
        />
        <List.Item
          title="New Custom Command"
          subtitle="Name a URL and give it extra yt-dlp options"
          icon={Icon.Plus}
          actions={
            <ActionPanel>
              <Action.Push
                title="New Custom Command"
                icon={Icon.Plus}
                shortcut="open"
                target={<NewCustomCommand config={config} />}
              />
            </ActionPanel>
          }
        />
        <EditFileRow
          config={config}
          path={configFile(config, "my/cmds.json")}
          title="Edit Custom Commands"
          subtitle="The commands file"
        />
      </List.Section>
      <List.Section title="Subscriptions">
        <List.Item
          title="Sync YouTube Subscriptions"
          subtitle="Replace the local channel list with YouTube's"
          icon={Icon.PersonLines}
          actions={
            <ActionPanel>
              <Action title="Sync Subscriptions" icon={Icon.ArrowClockwise} shortcut="open" onAction={sync} />
            </ActionPanel>
          }
        />
      </List.Section>
      <List.Section title="Files">
        <EditFileRow config={config} path={configFile(config, "config")} title="Edit Config" subtitle="yt-x config" />
        <EditFileRow config={config} path={mpvConfig} title="Edit MPV Config" subtitle="mpv.conf" />
        <EditFileRow config={config} path={ytDlpConfig} title="Edit yt-dlp Config" subtitle="yt-dlp/config" />
        <EditFileRow
          config={config}
          path={configFile(config, "my/playlists.json")}
          title="Edit Custom Playlists"
          subtitle="The saved playlists file"
        />
        <EditFileRow config={config} path={historyFile} title="Edit Search History" subtitle="search-history.txt" />
      </List.Section>
      <List.Section title="yt-x">
        <List.Item
          title="Open yt-x"
          subtitle="The terminal UI, for the flows a list cannot express"
          icon={Icon.Terminal}
          actions={
            <ActionPanel>
              <Action title="Open yt-x" icon={Icon.Terminal} shortcut="open" onAction={() => void runInYtX()} />
            </ActionPanel>
          }
        />
      </List.Section>
    </List>
  );
}

export function SearchHistory({ config, savedIds, onSavedChange }: Shared) {
  const [terms, setTerms] = useState(() => readSearchHistory(config.cacheDir).reverse());
  const historyFile = join(config.cacheDir, "search-history.txt");

  function clear(): void {
    void attempt("Could not clear the search history", async () => {
      const confirmed = await confirmAlert({
        title: "Clear the search history?",
        message: historyFile,
        primaryAction: { title: "Clear", style: Alert.ActionStyle.Destructive },
        dismissAction: { title: "Cancel", style: Alert.ActionStyle.Cancel },
      });
      if (!confirmed) return;

      clearSearchHistory(config.cacheDir);
      setTerms([]);
      await succeeded("Search history cleared");
    });
  }

  function editAction() {
    return config.editor ? (
      <Action
        title="Edit Search History"
        icon={Icon.Pencil}
        shortcut={{ modifiers: ["ctrl", "shift"], key: "e" }}
        onAction={() => void runInEditor(config.editor, historyFile)}
      />
    ) : (
      <Action.Open
        title="Open Search History File"
        icon={Icon.Pencil}
        shortcut={{ modifiers: ["ctrl", "shift"], key: "e" }}
        target={historyFile}
      />
    );
  }

  return (
    <List navigationTitle="Search History" searchBarPlaceholder="Filter past searches">
      {terms.map((term) => (
        <List.Item
          key={term}
          title={term}
          icon={Icon.MagnifyingGlass}
          actions={
            <ActionPanel>
              <Action.Push
                title="Search"
                icon={Icon.MagnifyingGlass}
                shortcut="open"
                target={
                  <VideoList
                    title={term}
                    target={searchUrl(term, DEFAULT_SP)}
                    config={config}
                    savedIds={savedIds}
                    onSavedChange={onSavedChange}
                  />
                }
              />
              <Action.CopyToClipboard title="Copy" content={term} shortcut="copy" />
              <ActionPanel.Section title="History">
                {editAction()}
                <Action
                  title="Clear Search History"
                  icon={Icon.Trash}
                  style="destructive"
                  shortcut="remove"
                  onAction={clear}
                />
              </ActionPanel.Section>
            </ActionPanel>
          }
        />
      ))}
      {terms.length === 0 ? (
        <List.EmptyView
          icon={Icon.Clock}
          title="No search history"
          description="Turn on search history in yt-x and search something."
          actions={
            <ActionPanel>
              {editAction()}
              <Action title="Clear Search History" icon={Icon.Trash} style="destructive" onAction={clear} />
            </ActionPanel>
          }
        />
      ) : null}
    </List>
  );
}

export function CustomCommands({ config, savedIds, onSavedChange }: Shared) {
  const [rows, setRows] = useState<CustomCommand[]>(() => readCustomCommands(config.configDir));
  const commandsFile = configFile(config, "my/cmds.json");

  function remember(command: CustomCommand): void {
    setRows((previous) => [...previous.filter((row) => row.name !== command.name), command]);
  }

  return (
    <List navigationTitle="Custom Commands" searchBarPlaceholder="Filter custom commands">
      <List.Section title="Custom Commands" subtitle={`${rows.length} saved`}>
        {rows.map((command) => (
          <List.Item
            key={command.name}
            title={command.name}
            subtitle={command.url}
            icon={Icon.Terminal}
            actions={
              <ActionPanel>
                <Action.Push
                  title="Open"
                  icon={Icon.Play}
                  shortcut="open"
                  target={
                    <VideoList
                      title={command.name}
                      target={command.url}
                      extraOpts={command.opts}
                      config={config}
                      savedIds={savedIds}
                      onSavedChange={onSavedChange}
                    />
                  }
                />
                <Action.CopyToClipboard title="Copy URL" content={command.url} shortcut="copy" />
                <ActionPanel.Section>
                  <Action.Push
                    title="New Custom Command"
                    icon={Icon.Plus}
                    shortcut={{ modifiers: ["ctrl", "shift"], key: "n" }}
                    target={<NewCustomCommand config={config} onSaved={remember} />}
                  />
                  {config.editor ? (
                    <Action
                      title="Edit Custom Commands"
                      icon={Icon.Pencil}
                      shortcut={{ modifiers: ["ctrl", "shift"], key: "e" }}
                      onAction={() => void runInEditor(config.editor, commandsFile)}
                    />
                  ) : (
                    <Action.Open
                      title="Open Custom Commands File"
                      icon={Icon.Pencil}
                      shortcut={{ modifiers: ["ctrl", "shift"], key: "e" }}
                      target={commandsFile}
                    />
                  )}
                </ActionPanel.Section>
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
      {rows.length === 0 ? (
        <List.EmptyView
          icon={Icon.Terminal}
          title="No custom commands"
          description="yt-x can list any URL with its own yt-dlp options."
          actions={
            <ActionPanel>
              <Action.Push
                title="New Custom Command"
                icon={Icon.Plus}
                shortcut="open"
                target={<NewCustomCommand config={config} onSaved={remember} />}
              />
            </ActionPanel>
          }
        />
      ) : null}
    </List>
  );
}

export function NewCustomCommand({
  config,
  onSaved,
}: {
  config: Config;
  onSaved?: (command: CustomCommand) => void;
}) {
  const { pop } = useNavigation();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [opts, setOpts] = useState("");

  async function submit(): Promise<void> {
    const trimmedName = name.trim();
    const trimmedUrl = url.trim();

    if (trimmedName === "" || trimmedUrl === "") {
      await showToast(Toast.Style.Failure, "A name and a URL are required");
      return;
    }

    const command: CustomCommand = { name: trimmedName, url: trimmedUrl, opts: splitWords(opts) };

    await attempt("Could not save the custom command", async () => {
      saveCustomCommand(command, config.configDir);
      onSaved?.(command);
      await succeeded("Custom command saved", command.name);
      pop();
    });
  }

  return (
    <Form
      navigationTitle="New Custom Command"
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Save Command" shortcut="save" onSubmit={submit} />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="name"
        title="Name"
        placeholder="My site search"
        value={name}
        onChange={setName}
        autoFocus
      />
      <Form.TextField
        id="url"
        title="URL"
        placeholder="https://example.com/search?q=…"
        value={url}
        onChange={setUrl}
        info="Any URL yt-dlp can list. The base options yt-x adds are always applied."
      />
      <Form.TextField
        id="opts"
        title="Extra yt-dlp options"
        placeholder="--no-warnings --playlist-end 20"
        value={opts}
        onChange={setOpts}
        info="Optional, space separated."
      />
    </Form>
  );
}
