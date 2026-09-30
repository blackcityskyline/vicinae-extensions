import { Action, ActionPanel, Detail } from "@vicinae/api";
import { usePromise } from "@raycast/utils";
import { useMemo } from "react";

import { getReadme } from "~/api/readme";
import type { Repository } from "~/api/github";
import ReadmeImages from "~/components/ReadmeImages";
import { absoluteDate, compactCount } from "~/utils/format";
import { extractReadmeImages } from "~/utils/readme-images";
import { Icon } from "~/utils/icons";

/**
 * The repository README, rendered inside the launcher.
 *
 * Pushed onto the navigation stack from a list row, so the list stays behind it
 * and `esc` returns to the results. `Detail` renders Markdown, which is what a
 * README already is.
 */
export default function RepositoryReadme({ repository }: { repository: Repository }) {
  const { data, isLoading, error } = usePromise(
    (fullName: string) => getReadme(fullName),
    [repository.full_name],
  );

  // Counted on the document as fetched, so the action reflects the README
  // rather than the part of it that survived truncation.
  const imageCount = useMemo(
    () =>
      extractReadmeImages(data?.markdown ?? "", {
        owner: repository.owner.login,
        repo: repository.name,
        defaultBranch: repository.default_branch,
      }).length,
    [data?.markdown, repository],
  );

  if (error) {
    return (
      <Detail
        navigationTitle={repository.full_name}
        markdown={`# Could not read the README\n\n${(error as Error).message}`}
      />
    );
  }

  if (isLoading || data === undefined) {
    return <Detail navigationTitle={repository.full_name} markdown="_Fetching the README…_" />;
  }

  if (data.missing) {
    return (
      <Detail
        navigationTitle={repository.full_name}
        markdown={`# No README\n\n\`${repository.full_name}\` does not have a README file on its default branch.`}
      />
    );
  }

  return (
    <Detail
      navigationTitle={data.title}
      markdown={data.markdown}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label
            title="Description"
            text={repository.description ?? "No description"}
          />
          <Detail.Metadata.Label title="Stars" text={compactCount(repository.stargazers_count)} icon={Icon.Star} />
          {repository.language ? (
            <Detail.Metadata.Label title="Language" text={repository.language} />
          ) : null}
          <Detail.Metadata.Label title="Last push" text={absoluteDate(repository.pushed_at)} />
          {repository.archived ? (
            <Detail.Metadata.Label title="Archived" text="This repository is read-only" />
          ) : null}
          {data.truncated ? (
            <Detail.Metadata.Label title="Note" text="Long README, truncated for display" />
          ) : null}
          <Detail.Metadata.Separator />
          <Detail.Metadata.Link
            title="Open on GitHub"
            target={repository.html_url}
            text={repository.full_name}
          />
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          <Action.OpenInBrowser title="Open on GitHub" url={repository.html_url} />
          {imageCount > 0 ? (
            <Action.Push
              title={`View Images (${imageCount})`}
              icon={Icon.Bubble}
              target={
                <ReadmeImages
                  markdown={data.markdown}
                  repo={{
                    owner: repository.owner.login,
                    repo: repository.name,
                    defaultBranch: repository.default_branch,
                  }}
                  fullName={repository.full_name}
                />
              }
            />
          ) : null}
          <Action.CopyToClipboard
            title="Copy README as Markdown"
            icon={Icon.CopyClipboard}
            content={data.markdown}
          />
        </ActionPanel>
      }
    />
  );
}
