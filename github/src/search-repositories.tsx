import { Action, ActionPanel, getPreferenceValues, List } from "@vicinae/api";
import { useCachedPromise } from "@raycast/utils";
import { useMemo, useState } from "react";

import { searchRepositories } from "~/api/github";
import { buildRepositoryQuery, REPO_SORTS, type RepoSort } from "~/api/search-query";
import ListEmptyView from "~/components/ListEmptyView";
import RepositoryListItem from "~/components/RepositoryListItem";
import MyRepositories from "~/my-repositories";
import { Icon } from "~/utils/icons";

/**
 * Search every repository the token can see.
 *
 * Three deliberate differences from the upstream extension, all of which came
 * out of its search returning fewer results than the GitHub website:
 *
 * 1. The query is built by `buildRepositoryQuery`, which cannot emit a `null`
 *    or empty token. Upstream interpolated `searchFilter` straight into a
 *    template literal while it was still `null`, sending the literal token
 *    "null" to GitHub, which ANDs it with the search text. Measured against the
 *    live API: "vicinae" returns 261 repositories, "null vicinae" returns 0.
 * 2. `archived:false` is not added by default. Upstream defaulted
 *    `includeArchived` to false, hiding every archived repository that the
 *    website does show.
 * 3. `filtering` is forced on. Passing `onSearchTextChange` normally turns
 *    Vicinae's builtin fuzzy filter off, which left GitHub's ordering as the
 *    only ranking. Re-enabling it narrows and re-ranks the fetched page using
 *    the `keywords` on each row, so a partial or mistyped term still matches
 *    something the server did send.
 */
export default function SearchRepositories() {
  const { includeForks, includeArchived } = getPreferenceValues<Preferences>();

  const [searchText, setSearchText] = useState("");
  const [sort, setSort] = useState<RepoSort>("relevance");

  const query = useMemo(
    () => buildRepositoryQuery({ text: searchText, sort, includeForks, includeArchived }),
    [searchText, sort, includeForks, includeArchived],
  );

  const { data, isLoading, error, pagination } = useCachedPromise(
    (query: string) => async (options: { page: number }) => {
      const items = await searchRepositories(query, options.page + 1);
      // GitHub caps repository search at 1000 results, so an empty page is the
      // only reliable end-of-results signal.
      return { data: items, hasMore: items.length > 0 };
    },
    [query],
    { execute: query !== "", keepPreviousData: true },
  );

  const repositories = useMemo(() => data ?? [], [data]);
  const hasQuery = searchText.trim() !== "";

  const subtitle = repositories.length > 0 ? String(repositories.length) : undefined;

  return (
    <List
      filtering
      isLoading={isLoading}
      throttle
      searchBarPlaceholder="Search repositories — try stars:>1000, in:readme, user: or org:"
      searchBarAccessory={
        <List.Dropdown tooltip="Sort" storeValue value={sort} onChange={(value) => setSort(value as RepoSort)}>
          {REPO_SORTS.map((option) => (
            <List.Dropdown.Item key={option.value} title={option.title} value={option.value} />
          ))}
        </List.Dropdown>
      }
      onSearchTextChange={setSearchText}
      pagination={pagination}
    >
      {repositories.length > 0 ? (
        <List.Section title={hasQuery ? "Search Results" : "Repositories"} subtitle={subtitle}>
          {repositories.map((repository) => (
            <RepositoryListItem key={repository.id} repository={repository} />
          ))}
        </List.Section>
      ) : (
        <ListEmptyView
          isLoading={isLoading}
          error={error}
          icon={Icon.Bubble}
          title={hasQuery ? "No repositories matched" : "Start typing to search GitHub"}
          description={
            hasQuery
              ? "Loosen the query, or widen it with a qualifier such as in:readme or stars:>100. Forks and archived repositories are included unless you turn them off in preferences."
              : "Searches public repositories and the private ones your token can read. Qualifiers such as user:, org:, topic: and in:readme are passed straight to GitHub."
          }
          actions={
            <ActionPanel>
              <Action.Push
                title="Browse My Repositories"
                icon={Icon.Person}
                target={<MyRepositories initialScope="mine" />}
              />
              <Action.Push
                title="Browse Starred Repositories"
                icon={Icon.Star}
                target={<MyRepositories initialScope="starred" />}
              />
            </ActionPanel>
          }
        />
      )}
    </List>
  );
}
