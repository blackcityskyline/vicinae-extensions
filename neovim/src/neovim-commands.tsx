import { Action, ActionPanel, Grid, Icon, List } from "@vicinae/api";
import { useEffect, useState } from "react";

import { readKeymaps, type Keymap } from "~/lib/keymaps";
import { layout, nvimPath } from "~/lib/preferences";

export default function NeovimCommands() {
  const [keymaps, setKeymaps] = useState<Keymap[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  async function load(): Promise<void> {
    setProblem(null);
    try {
      setKeymaps(await readKeymaps(nvimPath()));
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  /** The line to paste into a config: `vim.keymap.set("n", "<leader>fs", …)`. */
  function vimLine(keymap: Keymap): string {
    return `vim.keymap.set("n", "${keymap.lhs}", "${keymap.rhs}")`;
  }

  function actions(keymap: Keymap) {
    return (
      <ActionPanel>
        <Action.CopyToClipboard title="Copy Keys" content={keymap.lhs} shortcut="copy" />
        <Action.CopyToClipboard title="Copy vim.keymap.set" content={vimLine(keymap)} shortcut="copy-name" />
        <Action title="Refresh" icon={Icon.ArrowClockwise} shortcut="refresh" onAction={() => void load()} />
      </ActionPanel>
    );
  }

  if (layout() === "grid") {
    return (
      <Grid
        isLoading={keymaps === null && problem === null}
        navigationTitle="Keymaps"
        columns={5}
        searchBarPlaceholder="Search keymaps"
      >
        {problem === null ? null : (
          <Grid.EmptyView icon={Icon.Exclamationmark} title="Could not read the keymaps" description={problem} />
        )}
        <Grid.Section title="Keymaps">
          {(keymaps ?? []).map((keymap) => (
            <Grid.Item
              key={keymap.lhs}
              title={keymap.lhs}
              subtitle={keymap.description}
              content={Icon.Keyboard}
              keywords={[keymap.rhs]}
              actions={actions(keymap)}
            />
          ))}
        </Grid.Section>
      </Grid>
    );
  }

  return (
    <List
      isLoading={keymaps === null && problem === null}
      navigationTitle="Keymaps"
      searchBarPlaceholder="Search keymaps"
    >
      {problem === null ? null : (
        <List.EmptyView
          icon={Icon.Exclamationmark}
          title="Could not read the keymaps"
          description={problem}
          actions={
            <ActionPanel>
              <Action title="Try Again" icon={Icon.ArrowClockwise} shortcut="refresh" onAction={() => void load()} />
            </ActionPanel>
          }
        />
      )}
      {(keymaps ?? []).map((keymap) => (
        <List.Item
          key={keymap.lhs}
          title={keymap.lhs}
          subtitle={keymap.description}
          icon={Icon.Keyboard}
          keywords={[keymap.rhs]}
          actions={actions(keymap)}
        />
      ))}
    </List>
  );
}
