import { ActionPanel, Icon as RaycastIcon, List } from "@raycast/api";
import { useMemo, useState } from "react";

import { CommonIconActions } from "./actions";
import { MaterialIcon, searchIcons } from "./icons";
import { useIcons } from "./useIcons";

const PAGE_SIZE = 100;

export default function ListView() {
  const { icons, isLoading, error } = useIcons();
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);

  const matches = useMemo(() => searchIcons(icons ?? [], query), [icons, query]);
  const visible = matches.slice(0, limit);

  return (
    <List
      isLoading={isLoading}
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
      searchBarPlaceholder="Search icons..."
      throttle
    >
      {error ? (
        <List.EmptyView title="Could not fetch the Material icon catalogue" description={error.message} />
      ) : matches.length === 0 && !isLoading ? (
        <List.EmptyView title="No icon matches" />
      ) : (
        <List.Section title="Results" subtitle={matches.length > 0 ? `Found ${matches.length} icons` : undefined}>
          {visible.map((icon) => (
            <SearchListItem key={icon.name} icon={icon} />
          ))}
        </List.Section>
      )}
    </List>
  );
}

function SearchListItem({ icon }: { icon: MaterialIcon }) {
  return (
    <List.Item
      title={icon.name}
      subtitle={icon.codepoint}
      accessories={[
        { text: icon.categories },
        ...icon.assets.slice(1).map((asset) => ({
          icon: { source: asset.url, tintColor: { light: "black", dark: "white" } },
        })),
      ]}
      icon={{ source: icon.assets[0]?.url ?? RaycastIcon.Circle, tintColor: { light: "black", dark: "white" } }}
      actions={
        <ActionPanel>
          <CommonIconActions icon={icon} />
        </ActionPanel>
      }
    />
  );
}
