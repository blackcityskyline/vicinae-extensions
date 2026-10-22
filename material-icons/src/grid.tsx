import { Action, ActionPanel, Clipboard, Grid, Icon, showHUD } from "@raycast/api";
import { useCachedState } from "@raycast/utils";
import { useMemo, useState } from "react";

import { CommonIconActions } from "./actions";
import { assetUrl, MATERIAL_STYLES, MaterialIcon, MaterialIconStyle, searchIcons } from "./icons";
import { useIcons } from "./useIcons";

const PAGE_SIZE = 60;

export default function GridView() {
  const { icons, isLoading, error } = useIcons();
  const [style, setStyle] = useCachedState<MaterialIconStyle>("materialIconStyle", MaterialIconStyle.Filled);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);

  const matches = useMemo(() => searchIcons(icons ?? [], query), [icons, query]);
  const visible = matches.slice(0, limit);

  return (
    <Grid
      isLoading={isLoading}
      navigationTitle={selected ? `Material Icons – ${selected}` : "Material Icons"}
      searchBarPlaceholder="Search icons..."
      onSelectionChange={setSelected}
      filtering={false}
      onSearchTextChange={(text) => {
        setQuery(text);
        setLimit(PAGE_SIZE);
      }}
      pagination={{
        pageSize: PAGE_SIZE,
        hasMore: visible.length < matches.length,
        onLoadMore: () => setLimit((current) => current + PAGE_SIZE),
      }}
      searchBarAccessory={
        <Grid.Dropdown
          tooltip="Select Material Icon Style"
          value={style.toString()}
          onChange={(value) => setStyle(Number(value) as MaterialIconStyle)}
        >
          {MATERIAL_STYLES.map(({ title, value }) => (
            <Grid.Dropdown.Item key={title} title={title} value={value.toString()} />
          ))}
        </Grid.Dropdown>
      }
      throttle
    >
      {error ? (
        <Grid.EmptyView title="Could not fetch the Material icon catalogue" description={error.message} />
      ) : matches.length === 0 && !isLoading ? (
        <Grid.EmptyView title="No icon matches" />
      ) : (
        <Grid.Section title="Results" subtitle={matches.length > 0 ? `Found ${matches.length} icons` : undefined}>
          {visible.map((icon) => (
            <Grid.Item
              key={icon.codepoint}
              id={icon.name}
              title={icon.name}
              subtitle={icon.codepoint}
              keywords={icon.tags}
              content={{ source: assetUrl(icon, style), tintColor: { light: "black", dark: "white" } }}
              actions={
                <ActionPanel>
                  <CommonIconActions icon={icon}>
                    <Action
                      title="Copy SVG"
                      icon={Icon.CopyClipboard}
                      shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
                      onAction={async () => {
                        await copySvg(icon, style);
                      }}
                    />
                  </CommonIconActions>
                  <ActionPanel.Section title="Icon Style">
                    {MATERIAL_STYLES.map(({ title, value }) => (
                      <Action
                        key={title}
                        title={`Set Style: ${title}`}
                        icon={Icon.Brush}
                        onAction={() => setStyle(value)}
                      />
                    ))}
                  </ActionPanel.Section>
                </ActionPanel>
              }
            />
          ))}
        </Grid.Section>
      )}
    </Grid>
  );
}

async function copySvg(icon: MaterialIcon, style: MaterialIconStyle): Promise<void> {
  const response = await fetch(assetUrl(icon, style));
  if (!response.ok) {
    await showHUD(`Could not fetch the SVG (${response.status})`);
    return;
  }

  await Clipboard.copy(await response.text());
  await showHUD("SVG copied to clipboard");
}
