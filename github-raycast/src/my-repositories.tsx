import { getPreferenceValues, List } from "@vicinae/api";
import { useCachedPromise } from "@raycast/utils";
import { useState } from "react";

import { listStarredRepositories, listViewerRepositories, resultsPerPage } from "~/api/github";
import ListEmptyView from "~/components/ListEmptyView";
import RepositoryListItem from "~/components/RepositoryListItem";
import { Icon } from "~/utils/icons";

export type RepositoryScope = "mine" | "starred";

/**
 * Browse repositories you own or have starred.
 *
 * This view deliberately does *not* take `onSearchTextChange`. Without it,
 * Vicinae's builtin fuzzy filter stays on and does the matching in C++ against
 * the `keywords` on each row, so the list narrows as you type with no network
 * round trip, no per-keystroke request, and no result ceiling. That is the
 * opposite of the upstream extension, which re-queried GitHub on every keypress
 * and showed only the first 25 of whatever came back.
 */
export default function MyRepositories({ initialScope }: { initialScope?: RepositoryScope } = {}) {
  const { defaultRepositoryScope } = getPreferenceValues<Preferences>();
  const [scope, setScope] = useState<RepositoryScope>(initialScope ?? (defaultRepositoryScope as RepositoryScope) ?? "mine");

  const { data, isLoading, error, pagination } = useCachedPromise(
    (scope: RepositoryScope) => async (options: { page: number }) => {
      const items =
        scope === "starred"
          ? await listStarredRepositories(options.page + 1)
          : await listViewerRepositories("owner", "pushed", options.page + 1);

      return { data: items, hasMore: items.length === resultsPerPage() };
    },
    [scope],
    { keepPreviousData: true },
  );

  const repositories = data ?? [];

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Filter by name, description, language or topic"
      searchBarAccessory={
        <List.Dropdown tooltip="Scope" value={scope} onChange={(value) => setScope(value as RepositoryScope)}>
          <List.Dropdown.Item title="My Repositories" value="mine" icon={Icon.Person} />
          <List.Dropdown.Item title="Starred Repositories" value="starred" icon={Icon.Star} />
        </List.Dropdown>
      }
      pagination={pagination}
    >
      {repositories.length > 0 ? (
        <List.Section
          title={scope === "starred" ? "Starred Repositories" : "My Repositories"}
          subtitle={String(repositories.length)}
        >
          {repositories.map((repository) => (
            <RepositoryListItem key={repository.id} repository={repository} displayOwnerName />
          ))}
        </List.Section>
      ) : (
        <ListEmptyView
          isLoading={isLoading}
          error={error}
          icon={Icon.Person}
          title={scope === "starred" ? "You have not starred anything yet" : "No repositories found"}
          description={
            scope === "starred"
              ? "Star a repository on GitHub and it will show up here."
              : "This lists repositories you own. Use the Search Repositories command to reach repositories you have only been added to as a collaborator."
          }
        />
      )}
    </List>
  );
}
