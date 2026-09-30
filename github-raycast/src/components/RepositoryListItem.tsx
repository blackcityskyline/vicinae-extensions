import { Image, List } from "@vicinae/api";

import type { Repository } from "~/api/github";
import { repositoryKeywords } from "~/api/search-query";
import RepositoryActions from "~/components/RepositoryActions";
import { compactCount, relativeTime } from "~/utils/format";
import { Icon } from "~/utils/icons";

/** Fallback subtitle when a repository has no description. */
function metadataLine(repository: Repository): string {
  const parts = [
    repository.language,
    `${compactCount(repository.stargazers_count)} stars`,
    `updated ${relativeTime(repository.pushed_at)}`,
  ];
  return parts.filter((part): part is string => Boolean(part)).join(" · ");
}

function badges(repository: Repository): List.Item.Accessory[] {
  const badges: { text: string; tooltip: string }[] = [];
  if (repository.private) badges.push({ text: "Private", tooltip: "Private repository" });
  if (repository.fork) badges.push({ text: "Fork", tooltip: "Fork of another repository" });
  if (repository.archived) badges.push({ text: "Archived", tooltip: "Archived and read-only" });
  return badges;
}

/** Accessory entries, with empty values dropped so the row stays clean. */
function accessories(repository: Repository): List.Item.Accessory[] {
  const entries = [
    { text: repository.language ?? "", tooltip: "Primary language" },
    { text: `${compactCount(repository.stargazers_count)} stars`, tooltip: "Stargazers" },
    { text: relativeTime(repository.pushed_at), tooltip: "Last push" },
  ];
  return [...badges(repository), ...entries.filter((entry) => entry.text !== "")];
}

/**
 * A repository row.
 *
 * `keywords` carries the description, language and topics, none of which appear
 * in the title. Without them the builtin fuzzy filter can only match on
 * `owner/name`, so results the server did return stayed unmatchable.
 */
export default function RepositoryListItem({
  repository,
  displayOwnerName,
}: {
  repository: Repository;
  /** Append the owner to the title, for lists that are not already scoped. */
  displayOwnerName?: boolean;
}) {
  return (
    <List.Item
      title={displayOwnerName ? repository.full_name : repository.name}
      subtitle={repository.description ?? metadataLine(repository)}
      keywords={repositoryKeywords({
        nameWithOwner: repository.full_name,
        description: repository.description,
        primaryLanguage: repository.language,
        topics: repository.topics,
      })}
      icon={
        repository.owner.avatar_url
          ? { source: repository.owner.avatar_url, mask: Image.Mask.Circle, fallback: Icon.Box }
          : Icon.Box
      }
      accessories={accessories(repository)}
      actions={<RepositoryActions repository={repository} />}
    />
  );
}
