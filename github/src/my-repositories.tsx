import { getPreferenceValues, List } from "@vicinae/api";
import { useCachedPromise } from "@raycast/utils";
import { useState } from "react";

import { readCustomList } from "~/api/custom-list";
import { listAccessibleRepositories, listStarredRepositories, resultsPerPage } from "~/api/github";
import ListEmptyView from "~/components/ListEmptyView";
import RepositoryListItem from "~/components/RepositoryListItem";
import { Icon } from "~/utils/icons";

export type RepositoryScope = "mine" | "starred" | "listed";

const SCOPES: { value: RepositoryScope; title: string; icon: (typeof Icon)[keyof typeof Icon] }[] = [
  { value: "mine", title: "My Repositories", icon: Icon.Person },
  { value: "starred", title: "Starred Repositories", icon: Icon.Star },
  { value: "listed", title: "My List", icon: Icon.CheckList },
];

/**
 * Browse repositories you own, have starred, or added to your own list.
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
  const [scope, setScope] = useState<RepositoryScope>(
    initialScope ?? (defaultRepositoryScope as RepositoryScope) ?? "mine",
  );

  const { data, isLoading, error, pagination } = useCachedPromise(
    (target: RepositoryScope) => async (options: { page: number }) => {
      // The custom list stores the repository payload, so it renders from
      // storage with no network call and no resolution step.
      if (target === "listed") {
        return { data: await readCustomList(), hasMore: false };
      }

      const items =
        target === "starred"
          ? await listStarredRepositories(options.page + 1)
          : await listAccessibleRepositories("pushed", options.page + 1);

      return { data: items, hasMore: items.length === resultsPerPage() };
    },
    [scope],
    { keepPreviousData: true },
  );

  const repositories = data ?? [];
  const scopeTitle = SCOPES.find((entry) => entry.value === scope)?.title ?? "Repositories";

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Filter by name, description, language or topic"
      searchBarAccessory={
        <List.Dropdown tooltip="Scope" value={scope} onChange={(value) => setScope(value as RepositoryScope)}>
          {SCOPES.map((entry) => (
            <List.Dropdown.Item key={entry.value} title={entry.title} value={entry.value} icon={entry.icon} />
          ))}
        </List.Dropdown>
      }
      pagination={pagination}
    >
      {repositories.length > 0 ? (
        <List.Section title={scopeTitle} subtitle={String(repositories.length)}>
          {repositories.map((repository) => (
            <RepositoryListItem key={repository.id} repository={repository} displayOwnerName />
          ))}
        </List.Section>
      ) : (
        <ListEmptyView
          isLoading={isLoading}
          error={error}
          icon={Icon.Person}
          title={
            scope === "listed"
              ? "Your list is empty"
              : scope === "starred"
                ? "You have not starred anything yet"
                : "No repositories found"
          }
          description={
            scope === "listed"
              ? "Add repositories from any repository row with Add to My List. The list is stored locally and needs no token permissions."
              : scope === "starred"
                ? "Star a repository on GitHub and it will show up here."
                : "This lists repositories you own. Use the Search Repositories command to reach repositories you have only been added to as a collaborator."
          }
        />
      )}
    </List>
  );
}
