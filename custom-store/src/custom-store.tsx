import { Action, ActionPanel, getPreferenceValues, Icon, List } from "@vicinae/api";
import { useEffect, useState } from "react";
import { loadRepository } from "./api/repository";
import { isRemoteSource, type PackageEntry } from "./utils/repository";

interface State {
  entries: PackageEntry[];
  error?: string;
  loading: boolean;
}

function Actions({ onRefresh }: { onRefresh: () => void }) {
  return (
    <ActionPanel>
      <Action title="Refresh" icon={Icon.ArrowClockwise} shortcut="refresh" onAction={onRefresh} />
    </ActionPanel>
  );
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
          actions={<Actions onRefresh={load} />}
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
          actions={<Actions onRefresh={load} />}
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
            actions={<Actions onRefresh={load} />}
          />
        ))}
      </List.Section>
    </List>
  );
}
