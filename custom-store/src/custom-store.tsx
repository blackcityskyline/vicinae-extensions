import {
  Action,
  ActionPanel,
  Alert,
  confirmAlert,
  getPreferenceValues,
  Icon,
  List,
  showToast,
  Toast,
} from "@vicinae/api";
import { useEffect, useState } from "react";
import { installPackage, loadRepository, removeExtension } from "./api/repository";
import { isRemoteSource, type PackageEntry } from "./utils/repository";

interface State {
  entries: PackageEntry[];
  error?: string;
  loading: boolean;
}

export default function CustomStore() {
  const { repository } = getPreferenceValues<Preferences.CustomStore>();
  const source = repository?.trim() ?? "";
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

  async function install(entry: PackageEntry) {
    await showToast({ style: Toast.Style.Animated, title: `Installing ${entry.title}` });
    try {
      await installPackage(entry);
      await showToast(Toast.Style.Success, `${entry.title} installed`);
    } catch (error) {
      await showToast(Toast.Style.Failure, `Could not install ${entry.title}`, String(error));
    } finally {
      await load();
    }
  }

  async function uninstall(entry: PackageEntry) {
    const confirmed = await confirmAlert({
      title: `Uninstall ${entry.title}?`,
      message: `Its directory and its support data are deleted. Anything it stored in Vicinae's database stays.`,
      primaryAction: { title: "Uninstall", style: Alert.ActionStyle.Destructive },
    });
    if (!confirmed) return;

    try {
      await removeExtension(entry.id);
      await showToast(Toast.Style.Success, `${entry.title} uninstalled`);
    } catch (error) {
      await showToast(Toast.Style.Failure, `Could not remove ${entry.title}`, String(error));
    } finally {
      await load();
    }
  }

  function actions(entry?: PackageEntry) {
    return (
      <ActionPanel>
        {entry && !entry.installed && (
          <Action
            title="Install"
            icon={Icon.Download}
            shortcut={{ modifiers: ["ctrl"], key: "i" }}
            onAction={() => install(entry)}
          />
        )}
        {entry?.installed && (
          <Action
            title="Uninstall"
            icon={Icon.Trash}
            shortcut="remove-all"
            onAction={() => uninstall(entry)}
          />
        )}
        <Action title="Refresh" icon={Icon.ArrowClockwise} shortcut="refresh" onAction={load} />
      </ActionPanel>
    );
  }

  return (
    <List
      isLoading={state.loading}
      searchBarPlaceholder="Search extensions..."
      navigationTitle={source.length > 0 ? `Custom Store - ${source}` : "Custom Store"}
    >
      {state.error ? (
        <List.EmptyView
          title="Cannot read the repository"
          description={state.error}
          icon={Icon.Warning}
          actions={actions()}
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
          actions={actions()}
        />
      ) : null}
      <List.Section title={isRemoteSource(source) ? "Remote Repository" : "Local Repository"}>
        {state.entries.map((entry) => (
          <List.Item
            key={`${entry.source}:${entry.id}`}
            id={entry.id}
            title={entry.title}
            subtitle={entry.description}
            keywords={[entry.description, entry.author ?? ""]}
            icon={entry.icon ?? Icon.Plug}
            accessories={[
              ...(entry.author ? [{ tag: entry.author }] : []),
              ...(entry.installed ? [{ tag: { value: "Installed", color: "green" as const } }] : []),
            ]}
            actions={actions(entry)}
          />
        ))}
      </List.Section>
    </List>
  );
}
