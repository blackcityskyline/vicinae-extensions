import { Action, ActionPanel, Grid, Icon, List } from "@vicinae/api";
import { useEffect, useState } from "react";

import { readPlugins, shortCommit, type Plugin } from "~/lib/plugins";
import { layout } from "~/lib/preferences";

export default function ShowPlugins() {
  const [plugins, setPlugins] = useState<Plugin[] | null>(null);

  function load(): void {
    setPlugins(readPlugins());
  }

  useEffect(load, []);

  function actions(plugin: Plugin) {
    return (
      <ActionPanel>
        {plugin.url === null ? null : (
          <Action.OpenInBrowser title="Open Repository" url={plugin.url} shortcut="open" />
        )}
        <Action.CopyToClipboard title="Copy Commit" content={plugin.commit} shortcut="copy" />
        <Action.CopyToClipboard title="Copy Name" content={plugin.name} shortcut="copy-name" />
        <Action title="Refresh" icon={Icon.ArrowClockwise} shortcut="refresh" onAction={load} />
      </ActionPanel>
    );
  }

  if (layout() === "grid") {
    return (
      <Grid
        isLoading={plugins === null}
        navigationTitle="Installed Plugins"
        columns={5}
        searchBarPlaceholder="Search plugins"
      >
        {plugins !== null && plugins.length === 0 ? (
          <Grid.EmptyView
            icon={Icon.Box}
            title="No lazy.nvim plugins"
            description="The list is read from ~/.config/nvim/lazy-lock.json and each plugin's origin remote."
          />
        ) : null}
        <Grid.Section title="Installed Plugins">
          {(plugins ?? []).map((plugin) => (
            <Grid.Item
              key={plugin.name}
              title={plugin.name}
              subtitle={plugin.branch}
              content={Icon.Box}
              keywords={[plugin.commit, plugin.url ?? ""]}
              actions={actions(plugin)}
            />
          ))}
        </Grid.Section>
      </Grid>
    );
  }

  return (
    <List
      isLoading={plugins === null}
      navigationTitle="Installed Plugins"
      searchBarPlaceholder="Search plugins"
    >
      {plugins !== null && plugins.length === 0 ? (
        <List.EmptyView
          icon={Icon.Box}
          title="No lazy.nvim plugins"
          description="The list is read from ~/.config/nvim/lazy-lock.json and each plugin's origin remote."
        />
      ) : null}
      {(plugins ?? []).map((plugin) => (
        <List.Item
          key={plugin.name}
          title={plugin.name}
          subtitle={`${plugin.branch} · ${shortCommit(plugin.commit)}`}
          icon={Icon.Box}
          keywords={[plugin.commit, plugin.url ?? ""]}
          actions={actions(plugin)}
        />
      ))}
    </List>
  );
}
