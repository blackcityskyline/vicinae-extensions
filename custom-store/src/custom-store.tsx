import {
  Action,
  ActionPanel,
  Alert,
  Color,
  confirmAlert,
  Detail,
  getPreferenceValues,
  Icon,
  Image,
  List,
  showToast,
  Toast,
  useNavigation,
} from "@vicinae/api";
import { useEffect, useState } from "react";
import { installPackage, loadRepository, removeExtension } from "./api/repository";
import { isRemoteSource, type PackageEntry } from "./utils/repository";

interface State {
  entries: PackageEntry[];
  error?: string;
  loading: boolean;
}

/** `formatCount` of the built-in store: 1'200 → 1.2K, 1'300'000 → 1.3M. */
function formatCount(count: number): string {
  if (count > 1_000_000) return `${Math.ceil((count / 1_000_000) * 10) / 10}M`;
  if (count > 1_000) return `${Math.ceil((count / 1_000) * 10) / 10}K`;
  return String(count);
}

export default function CustomStore() {
  const { repository } = getPreferenceValues<Preferences.CustomStore>();
  const source = repository?.trim() ?? "";
  const { push } = useNavigation();
  const [state, setState] = useState<State>({ entries: [], loading: true });

  async function load() {
    if (source.length === 0) {
      setState({ entries: [], loading: false, error: "Set the Repository preference first." });
      return;
    }

    setState((current) => ({ ...current, loading: true, error: undefined }));
    try {
      setState({ entries: await loadRepository(source), loading: false });
    } catch (error) {
      setState({ entries: [], loading: false, error: String(error) });
    }
  }

  useEffect(() => {
    load();
    // The repository is read once; Refresh re-reads it.
  }, []);

  return (
    <List
      isLoading={state.loading}
      searchBarPlaceholder="Browse custom extensions"
      navigationTitle="Custom Store"
    >
      {state.error ? (
        <List.EmptyView
          title="Cannot read the repository"
          description={state.error}
          icon={Icon.Warning}
          actions={<ExtensionActions onRefresh={load} />}
        />
      ) : null}
      {!state.error && state.entries.length === 0 && !state.loading ? (
        <List.EmptyView
          title="Nothing to install"
          description={
            isRemoteSource(source)
              ? "index.json lists no extension with an archive."
              : "The directory holds no bundle with a package.json."
          }
          icon={Icon.Plug}
          actions={<ExtensionActions onRefresh={load} />}
        />
      ) : null}
      <List.Section title="Extensions">
        {state.entries.map((entry) => (
          <List.Item
            key={`${entry.source}:${entry.id}`}
            id={entry.id}
            title={entry.title}
            subtitle={entry.description}
            keywords={[entry.id, entry.author ?? ""]}
            icon={entry.icon ?? Icon.Plug}
            accessories={accessories(entry)}
            actions={
              <ExtensionActions
                entry={entry}
                onDetails={() => push(<ExtensionDetail entry={entry} onChanged={load} />)}
                onRefresh={load}
              />
            }
          />
        ))}
      </List.Section>
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

/** The list row and the detail page offer the same install and uninstall. */
function ExtensionActions(props: {
  entry?: PackageEntry;
  installed?: boolean;
  onInstalled?: (installed: boolean) => void;
  onDetails?: () => void;
  onRefresh?: () => void;
}) {
  const { entry, installed = entry?.installed ?? false, onInstalled, onDetails, onRefresh } = props;

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
    </ActionPanel>
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
