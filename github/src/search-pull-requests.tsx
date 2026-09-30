import { List } from "@vicinae/api";
import { useCachedPromise } from "@raycast/utils";
import { useMemo, useState } from "react";

import { searchPullRequests } from "~/api/github";
import {
  buildPullRequestQuery,
  type PullRequestPreset,
  type StateFilter,
} from "~/api/search-query";
import IssueListItem from "~/components/IssueListItem";
import ListEmptyView from "~/components/ListEmptyView";
import { Icon } from "~/utils/icons";

/** Flat dropdown; see the note in `search-issues.tsx` for why. */
const FILTERS = [
  { title: "All Open", preset: "all", state: "open" },
  { title: "All Closed", preset: "all", state: "closed" },
  { title: "Everything", preset: "all", state: "all" },
  { title: "Review Requested", preset: "review-requested", state: "open" },
  { title: "Created by Me", preset: "authored", state: "open" },
  { title: "Assigned to Me", preset: "assigned", state: "open" },
  { title: "Mentioning Me", preset: "mentioning", state: "open" },
] as const satisfies readonly { title: string; preset: PullRequestPreset; state: StateFilter }[];

const DEFAULT_FILTER = FILTERS[0];

/** Search pull requests. Mirrors Search Issues, with pull-request presets. */
export default function SearchPullRequests() {
  const [searchText, setSearchText] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>(DEFAULT_FILTER);

  const query = useMemo(
    () => buildPullRequestQuery({ text: searchText, preset: filter.preset, state: filter.state }),
    [searchText, filter],
  );

  const { data, isLoading, error, pagination } = useCachedPromise(
    (query: string) => async (options: { page: number }) => {
      const items = await searchPullRequests(query, options.page + 1);
      return { data: items, hasMore: items.length > 0 };
    },
    [query],
    { keepPreviousData: true },
  );

  const pullRequests = useMemo(() => data ?? [], [data]);

  function handleFilterChange(value: string) {
    const match = FILTERS.find((candidate) => `${candidate.preset}:${candidate.state}` === value);
    if (match) setFilter(match);
  }

  return (
    <List
      filtering
      isLoading={isLoading}
      throttle
      searchBarPlaceholder="Search pull requests — try review-requested:@me, draft:false"
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
      {pullRequests.length > 0 ? (
        <List.Section title="Pull Requests" subtitle={String(pullRequests.length)}>
          {pullRequests.map((item) => (
            <IssueListItem key={item.id} item={item} />
          ))}
        </List.Section>
      ) : (
        <ListEmptyView
          isLoading={isLoading}
          error={error}
          icon={Icon.Git}
          title={searchText.trim() ? "No pull requests matched" : "Start typing to search pull requests"}
          description={
            searchText.trim()
              ? "Try widening it: drop a qualifier, or switch the filter to All."
              : "Searches pull requests in every repository your token can read. Qualifiers such as review-requested:, author: and repo: are passed straight to GitHub."
          }
        />
      )}
    </List>
  );
}
