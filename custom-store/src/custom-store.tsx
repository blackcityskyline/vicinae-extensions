import {
  Action,
  ActionPanel,
  Alert,
  Color,
  confirmAlert,
  Detail,
  Form,
  getPreferenceValues,
  Icon,
  Image,
  List,
  LocalStorage,
  showToast,
  Toast,
  useNavigation,
} from "@vicinae/api";
import { useEffect, useMemo, useState } from "react";
import { installPackage, loadSources, removeExtension } from "./api/repository";
import {
  allSources,
  sourceKind,
  sourceKindLabel,
  type PackageEntry,
  type SourceFailure,
} from "./utils/repository";

/** The sources added from the store; the preference is always the first one. */
const SOURCES_KEY = "sources";

interface State {
  entries: PackageEntry[];
  failures: SourceFailure[];
  loading: boolean;
}

/** `formatCount` of the built-in store: 1'200 → 1.2K, 1'300'000 → 1.3M. */
function formatCount(count: number): string {
  if (count > 1_000_000) return `${Math.ceil((count / 1_000_000) * 10) / 10}M`;
  if (count > 1_000) return `${Math.ceil((count / 1_000) * 10) / 10}K`;
  return String(count);
}

/** LocalStorage holds scalars, so the list travels as JSON; a miss is null or undefined. */
async function storedSources(): Promise<string[]> {
  const stored = await LocalStorage.getItem<string>(SOURCES_KEY);
  if (!stored) return [];
  try {
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function sourceIcon(source: string): Icon {
  const kind = sourceKind(source);
  return kind === "git" ? Icon.Git : kind === "index" ? Icon.Network : Icon.Folder;
}

export default function CustomStore() {
  const { repository } = getPreferenceValues<Preferences.CustomStore>();
  const preference = (repository ?? "").trim();
  const { push } = useNavigation();
  const [added, setAdded] = useState<string[]>([]);
  const [state, setState] = useState<State>({ entries: [], failures: [], loading: true });
  const sources = useMemo(() => allSources(preference, added), [preference, added]);

  async function load(list: string[], refresh = false) {
    setState((current) => ({ ...current, loading: true }));
    setState({ ...(await loadSources(list, refresh)), loading: false });
  }

  async function save(next: string[]) {
    setAdded(next);
    await LocalStorage.setItem(SOURCES_KEY, JSON.stringify(next));
    await load(allSources(preference, next));
  }

  useEffect(() => {
    storedSources().then((list) => {
      setAdded(list);
      load(allSources(preference, list));
    });
    // The sources are read once; Refresh re-reads them.
  }, []);

  function manage() {
    push(<Sources added={added} preference={preference} onChanged={save} />);
  }

  function refresh() {
    load(sources, true);
  }

  return (
    <List
      isLoading={state.loading}
      searchBarPlaceholder="Browse custom extensions"
      navigationTitle="Custom Store"
    >
      {!state.loading && state.entries.length === 0 && state.failures.length === 0 ? (
        <List.EmptyView
          title="Nothing to install"
          description="No source holds a built extension bundle. Read the source and add more with Manage Sources."
          icon={Icon.Plug}
          actions={<StoreActions onRefresh={refresh} onSources={manage} />}
        />
      ) : null}
      {state.entries.length > 0 ? (
        <List.Section title="Extensions">
          {state.entries.map((entry) => (
            <List.Item
              key={`${entry.repository ?? entry.origin}:${entry.id}`}
              id={entry.id}
              title={entry.title}
              subtitle={entry.description}
              keywords={[entry.id, entry.author ?? "", entry.repository ?? ""]}
              icon={entry.icon ?? Icon.Plug}
              accessories={accessories(entry)}
              actions={
                <ExtensionActions
                  entry={entry}
                  onDetails={() =>
                    push(
                      <ExtensionDetail
                        entry={entry}
                        onChanged={() => load(sources)}
                      />,
                    )
                  }
                  onRefresh={refresh}
                  onSources={manage}
                />
              }
            />
          ))}
        </List.Section>
      ) : null}
      {state.failures.length > 0 ? (
        <List.Section
          title={state.failures.length === 1 ? "Source that failed" : "Sources that failed"}
        >
          {state.failures.map((failure) => (
            <List.Item
              key={failure.source}
              id={failure.source}
              title={failure.source}
              subtitle={failure.message}
              icon={Icon.Warning}
              keywords={[failure.message]}
              actions={
                <ActionPanel>
                  <Action
                    title="Refresh"
                    icon={Icon.ArrowClockwise}
                    shortcut="refresh"
                    onAction={refresh}
                  />
                  <Action
                    title="Manage Sources"
                    icon={Icon.Store}
                    shortcut={{ modifiers: ["ctrl", "shift"], key: "s" }}
                    onAction={manage}
                  />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      ) : null}
    </List>
  );
}

/** The store row's right side: installed check, download count, author avatar. */
function accessories(entry: PackageEntry): List.Item.Accessory[] {
  return [
    ...(entry.installed
      ? [{ icon: { source: Icon.CheckCircle, tintColor: Color.Green }, tooltip: "Installed" }]
      : []),
    ...(entry.downloads !== undefined
      ? [
          {
            icon: { source: Icon.ArrowDownCircle, tintColor: Color.SecondaryText },
            text: formatCount(entry.downloads),
          },
        ]
      : []),
    {
      icon: entry.avatar
        ? { source: entry.avatar, mask: Image.Mask.Circle }
        : { source: Icon.Person, tintColor: Color.SecondaryText },
    },
  ];
}

/** Refresh and source management, for the views that hold no extension row. */
function StoreActions(props: { onRefresh?: () => void; onSources?: () => void }) {
  return (
    <ActionPanel>
      {props.onRefresh && (
        <Action
          title="Refresh"
          icon={Icon.ArrowClockwise}
          shortcut="refresh"
          onAction={props.onRefresh}
        />
      )}
      {props.onSources && (
        <Action
          title="Manage Sources"
          icon={Icon.Store}
          shortcut={{ modifiers: ["ctrl", "shift"], key: "s" }}
          onAction={props.onSources}
        />
      )}
    </ActionPanel>
  );
}

/** The list row and the detail page offer the same install and uninstall. */
function ExtensionActions(props: {
  entry?: PackageEntry;
  installed?: boolean;
  onInstalled?: (installed: boolean) => void;
  onDetails?: () => void;
  onRefresh?: () => void;
  onSources?: () => void;
}) {
  const {
    entry,
    installed = entry?.installed ?? false,
    onInstalled,
    onDetails,
    onRefresh,
    onSources,
  } = props;

  async function install() {
    if (!entry) return;
    await showToast({ style: Toast.Style.Animated, title: `Installing ${entry.title}` });
    try {
      await installPackage(entry);
      await showToast(Toast.Style.Success, `${entry.title} installed`);
      onInstalled?.(true);
    } catch (error) {
      await showToast(Toast.Style.Failure, `Could not install ${entry.title}`, String(error));
    } finally {
      onRefresh?.();
    }
  }

  async function uninstall() {
    if (!entry) return;
    const confirmed = await confirmAlert({
      title: `Uninstall ${entry.title}?`,
      message: `Its directory and its support data are deleted. Anything it stored in Vicinae's database stays.`,
      primaryAction: { title: "Uninstall", style: Alert.ActionStyle.Destructive },
    });
    if (!confirmed) return;

    try {
      await removeExtension(entry.id);
      await showToast(Toast.Style.Success, `${entry.title} uninstalled`);
      onInstalled?.(false);
    } catch (error) {
      await showToast(Toast.Style.Failure, `Could not remove ${entry.title}`, String(error));
    } finally {
      onRefresh?.();
    }
  }

  return (
    <ActionPanel>
      {onDetails && <Action title="Show Details" icon={Icon.ComputerChip} onAction={onDetails} />}
      {entry && !installed && (
        <Action
          title="Install Extension"
          icon={Icon.Download}
          shortcut={{ modifiers: ["ctrl"], key: "i" }}
          onAction={install}
        />
      )}
      {entry && installed && (
        <Action
          title="Uninstall Extension"
          icon={Icon.Trash}
          shortcut="remove-all"
          onAction={uninstall}
        />
      )}
      {onRefresh && (
        <Action title="Refresh" icon={Icon.ArrowClockwise} shortcut="refresh" onAction={onRefresh} />
      )}
      {onSources && (
        <Action
          title="Manage Sources"
          icon={Icon.Store}
          shortcut={{ modifiers: ["ctrl", "shift"], key: "s" }}
          onAction={onSources}
        />
      )}
    </ActionPanel>
  );
}

/**
 * The sources are the preference plus the ones added here. The preference row
 * cannot be removed — that is an edit to the extension's settings — so it says
 * where it comes from.
 */
function Sources(props: {
  added: string[];
  preference: string;
  onChanged: (added: string[]) => void;
}) {
  const [added, setAdded] = useState(props.added);
  const { push } = useNavigation();
  const sources = allSources(props.preference, added);

  function update(next: string[]) {
    setAdded(next);
    props.onChanged(next);
  }

  function add(source: string) {
    if (sources.includes(source)) {
      showToast(Toast.Style.Failure, "That source is already in the list");
      return;
    }
    update([...added, source]);
  }

  return (
    <List navigationTitle="Sources" searchBarPlaceholder="Sources of extensions">
      <List.Section title="Sources">
        {sources.map((source) => {
          const fromPreference = source === props.preference;
          return (
            <List.Item
              key={source}
              id={source}
              title={source}
              subtitle={sourceKindLabel(source)}
              icon={sourceIcon(source)}
              accessories={fromPreference ? [{ tag: "Preference" }] : []}
              actions={
                <ActionPanel>
                  <Action
                    title="Add Source"
                    icon={Icon.Plus}
                    shortcut="new"
                    onAction={() => push(<AddSource onAdd={add} />)}
                  />
                  {!fromPreference && (
                    <Action
                      title="Remove Source"
                      icon={Icon.Trash}
                      shortcut="remove"
                      onAction={() => update(added.filter((item) => item !== source))}
                    />
                  )}
                </ActionPanel>
              }
            />
          );
        })}
      </List.Section>
    </List>
  );
}

function AddSource(props: { onAdd: (source: string) => void }) {
  const { pop } = useNavigation();

  return (
    <Form
      navigationTitle="Add Source"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Add Source"
            icon={Icon.Plus}
            shortcut="save"
            onSubmit={(values: Form.Values) => {
              const source = typeof values.source === "string" ? values.source.trim() : "";
              if (source.length === 0) {
                showToast(Toast.Style.Failure, "The source is empty");
                return false;
              }
              props.onAdd(source);
              pop();
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="source"
        title="Source"
        placeholder="~/extensions, https://example.com/index.json, https://github.com/you/store"
      />
      <Form.Description text="A folder of built bundles, an index.json URL, or a Git repository from any host whose root holds built bundles. A folder needs ~ or an absolute path; a Git repository is cloned once and pulled only on Refresh." />
    </Form>
  );
}

/** The detail page of the built-in store: icon, title, description, commands, sidebar. */
function ExtensionDetail(props: { entry: PackageEntry; onChanged: () => void }) {
  const { entry, onChanged } = props;
  const [installed, setInstalled] = useState(entry.installed);

  return (
    <Detail
      navigationTitle={`Custom Store - ${entry.title}`}
      markdown={markdown(entry)}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label
            title={entry.repository ? sourceKindLabel(entry.repository) : "Source"}
            text={entry.repository ?? "Unknown"}
            icon={entry.repository ? sourceIcon(entry.repository) : undefined}
          />
          <Detail.Metadata.Label
            title="Author"
            text={entry.author ?? "Unknown"}
            icon={Icon.Person}
          />
          {entry.downloads !== undefined && (
            <Detail.Metadata.Label
              title="Downloads"
              text={formatCount(entry.downloads)}
              icon={Icon.ArrowDownCircle}
            />
          )}
          {installed && (
            <Detail.Metadata.Label
              title="Status"
              text="Installed"
              icon={{ source: Icon.CheckCircle, tintColor: Color.Green }}
            />
          )}
          {entry.platforms.length > 0 && (
            <Detail.Metadata.Label title="Platforms" text={entry.platforms.join(", ")} />
          )}
          {entry.categories.length > 0 && <Detail.Metadata.Separator />}
          {entry.categories.length > 0 && (
            <Detail.Metadata.TagList title="Categories">
              {entry.categories.map((category) => (
                <Detail.Metadata.TagList.Item key={category} text={category} />
              ))}
            </Detail.Metadata.TagList>
          )}
          {entry.readme && (
            <Detail.Metadata.Link title="README" target={entry.readme} text="Open README" />
          )}
          {entry.sourceUrl && (
            <Detail.Metadata.Link title="Source Code" target={entry.sourceUrl} text="View Code" />
          )}
        </Detail.Metadata>
      }
      actions={
        <ExtensionActions
          entry={entry}
          installed={installed}
          onInstalled={(value) => {
            setInstalled(value);
            onChanged();
          }}
        />
      }
    />
  );
}

function markdown(entry: PackageEntry): string {
  const lines = [entry.icon ? `![](${entry.icon})` : "", `# ${entry.title}`, entry.description];

  if (entry.commands.length > 0) {
    lines.push("## Commands");
    for (const command of entry.commands) {
      lines.push(`**${command.title}**`);
      if (command.description) lines.push(command.description);
    }
  }

  return lines.filter((line) => line.length > 0).join("\n\n");
}
