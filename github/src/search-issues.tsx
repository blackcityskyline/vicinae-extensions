import { List } from "@vicinae/api";
import { useCachedPromise } from "@raycast/utils";
import { useMemo, useState } from "react";

import { searchIssues } from "~/api/github";
import { buildIssueQuery, type IssuePreset, type StateFilter } from "~/api/search-query";
import IssueListItem from "~/components/IssueListItem";
import ListEmptyView from "~/components/ListEmptyView";
import { Icon } from "~/utils/icons";

/**
 * The filter is one flat dropdown rather than a preset list crossed with a
 * state list: `List.Dropdown` has no sections, and a 4x3 cross product is a
 * worse menu than the six combinations people actually reach for. `state:closed`
 * is still available by typing it.
 */
const FILTERS = [
  { title: "All Open", preset: "all", state: "open" },
  { title: "All Closed", preset: "all", state: "closed" },
  { title: "Everything", preset: "all", state: "all" },
  { title: "Created by Me", preset: "authored", state: "open" },
  { title: "Assigned to Me", preset: "assigned", state: "open" },
  { title: "Mentioning Me", preset: "mentioning", state: "open" },
] as const satisfies readonly { title: string; preset: IssuePreset; state: StateFilter }[];

const DEFAULT_FILTER = FILTERS[0];

/**
 * Search issues.
 *
 * The upstream extension shipped this as two commands, My Issues and Search
 * Issues. The first was a fixed `author:@me` filter, so it is a dropdown item
 * here instead of a second entry in the command palette.
 */
export default function SearchIssues() {
  const [searchText, setSearchText] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>(DEFAULT_FILTER);

  const query = useMemo(
    () => buildIssueQuery({ text: searchText, preset: filter.preset, state: filter.state }),
    [searchText, filter],
  );

  const { data, isLoading, error, pagination } = useCachedPromise(
    (query: string) => async (options: { page: number }) => {
      const items = await searchIssues(query, options.page + 1);
      return { data: items, hasMore: items.length > 0 };
    },
    [query],
    { keepPreviousData: true },
  );

  const issues = useMemo(() => data ?? [], [data]);

  function handleFilterChange(value: string) {
    const match = FILTERS.find((candidate) => `${candidate.preset}:${candidate.state}` === value);
    if (match) setFilter(match);
  }

  return (
    <List
      filtering
      isLoading={isLoading}
      throttle
      searchBarPlaceholder="Search issues — try label:bug, repo:acme/widget"
      searchBarAccessory={
        <List.Dropdown
          tooltip="Filter"
          storeValue
          value={`${filter.preset}:${filter.state}`}
          onChange={handleFilterChange}
        >
          {FILTERS.map((option) => (
            <List.Dropdown.Item
              key={`${option.preset}:${option.state}`}
              title={option.title}
              value={`${option.preset}:${option.state}`}
            />
          ))}
        </List.Dropdown>
      }
      onSearchTextChange={setSearchText}
      pagination={pagination}
    >
      {issues.length > 0 ? (
        <List.Section title="Issues" subtitle={String(issues.length)}>
          {issues.map((item) => (
            <IssueListItem key={item.id} item={item} />
          ))}
        </List.Section>
      ) : (
        <ListEmptyView
          isLoading={isLoading}
          error={error}
          icon={Icon.Exclamationmark}
          title={searchText.trim() ? "No issues matched" : "Start typing to search issues"}
          description={
            searchText.trim()
              ? "Try widening it: drop a qualifier, or switch the filter to All."
              : "Searches issues in every repository your token can read. Qualifiers such as label:, author:, repo: and no: are passed straight to GitHub."
          }
        />
      )}
    </List>
  );
}
