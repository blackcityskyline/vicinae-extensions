import { Action, ActionPanel, Color, getPreferenceValues, Grid, Icon } from "@raycast/api";
import { Fragment, ReactNode, useMemo, useState } from "react";

import { copyName, filterIcons, LucideIcon, toPascalCase } from "./icons";
import { useIcons } from "./useIcons";

type Preferences = {
  primaryAction?: string;
  pascalCaseName?: boolean;
};

const PAGE_SIZE = 60;

export default function SearchIcons() {
  const { primaryAction = "copy-name", pascalCaseName = false } = getPreferenceValues<Preferences>();
  const { icons, isLoading, error } = useIcons();
  const [colorName, setColorName] = useState<string>("PrimaryText");
  const [searchText, setSearchText] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [selectedIcon, setSelectedIcon] = useState<string | null>(null);

  const matches = useMemo(() => filterIcons(icons ?? [], searchText), [icons, searchText]);
  const visible = matches.slice(0, limit);
  const color = Color[colorName as keyof typeof Color] ?? Color.PrimaryText;

  return (
    <Grid
      columns={8}
      inset={Grid.Inset.Large}
      isLoading={isLoading}
      navigationTitle={selectedIcon ? `Search Icons – ${selectedIcon}` : "Search Icons"}
      filtering={false}
      onSearchTextChange={(text) => {
        setSearchText(text);
        setLimit(PAGE_SIZE);
      }}
      onSelectionChange={setSelectedIcon}
      pagination={{
        pageSize: PAGE_SIZE,
        hasMore: visible.length < matches.length,
        onLoadMore: () => setLimit((current) => current + PAGE_SIZE),
      }}
      throttle
      searchBarAccessory={
        <Grid.Dropdown tooltip="Change Color" value={colorName} onChange={setColorName}>
          {Object.entries(Color).map(([name, value]) => (
            <Grid.Dropdown.Item key={name} title={name} value={name} icon={{ source: Icon.Circle, tintColor: value }} />
          ))}
        </Grid.Dropdown>
      }
    >
      {error ? (
        <Grid.EmptyView title="Could not fetch the Lucide catalogue" description={error.message} />
      ) : matches.length === 0 && !isLoading ? (
        <Grid.EmptyView title="No icon matches" />
      ) : (
        <Grid.Section title="Results" subtitle={`${matches.length}`}>
          {visible.map((icon) => (
            <Grid.Item
              key={icon.name}
              id={icon.name}
              title={icon.name}
              content={{ source: icon.path, tintColor: color }}
              keywords={icon.keywords}
              actions={<IconActions icon={icon} primaryAction={primaryAction} pascalCaseName={pascalCaseName} />}
            />
          ))}
        </Grid.Section>
      )}
    </Grid>
  );
}

/**
 * The primary action preference reorders this list instead of replacing it, so
 * every action keeps a shortcut and nothing becomes unreachable.
 */
function IconActions({
  icon,
  primaryAction,
  pascalCaseName,
}: {
  icon: LucideIcon;
  primaryAction: string;
  pascalCaseName: boolean;
}) {
  const nodes: Record<string, ReactNode> = {
    "copy-name": (
      <Action.CopyToClipboard
        title="Copy Name"
        content={copyName(icon.name, pascalCaseName)}
        shortcut={{ modifiers: ["cmd"], key: "c" }}
      />
    ),
    "copy-svg": (
      <Action.CopyToClipboard
        title="Copy SVG"
        content={icon.content}
        shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
      />
    ),
    "paste-svg": (
      <Action.Paste
        title="Paste SVG"
        content={icon.content}
        shortcut={{ modifiers: ["cmd", "shift"], key: "v" }}
      />
    ),
    "copy-component": (
      <Action.CopyToClipboard
        title="Copy Component"
        content={`<${toPascalCase(icon.name)} />`}
        shortcut={{ modifiers: ["cmd", "alt"], key: "c" }}
      />
    ),
    "open-in-browser": (
      <Action.OpenInBrowser
        title="Open in Browser"
        url={icon.path}
        shortcut={{ modifiers: ["cmd"], key: "o" }}
      />
    ),
  };

  const order = Object.keys(nodes);
  const primary = order.indexOf(primaryAction);
  if (primary > 0) order.unshift(...order.splice(primary, 1));

  return (
    <ActionPanel>
      {order.map((id) => (
        <Fragment key={id}>{nodes[id]}</Fragment>
      ))}
    </ActionPanel>
  );
}
