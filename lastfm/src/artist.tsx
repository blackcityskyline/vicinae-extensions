import { Action, ActionPanel, Detail, Icon } from "@vicinae/api";
import { useEffect, useState } from "react";

import { artistPage } from "~/api/lastfm";
import { useConfig } from "~/components/state";
import { artistMarkdown } from "~/utils/artist";

export default function Artist({ name }: { name: string }) {
  const config = useConfig();
  const [page, setPage] = useState<Awaited<ReturnType<typeof artistPage>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void artistPage(config.apiKey, name)
      .then((found) => {
        if (!cancelled) setPage(found);
      })
      .catch((failure: unknown) => {
        if (!cancelled) setError(failure instanceof Error ? failure.message : "Could not load that artist.");
      });

    return () => {
      cancelled = true;
    };
  }, [config.apiKey, name]);

  if (error) return <Detail markdown={`# ${name}\n\n${error}`} />;
  if (!page) return <Detail markdown={`# ${name}\n\nLoading…`} />;

  return (
    <Detail
      navigationTitle={name}
      markdown={artistMarkdown(page)}
      actions={
        <ActionPanel>
          <Action.OpenInBrowser title="Open on Last.fm" url={page.url} icon={Icon.Globe01} />
          <Action.CopyToClipboard title="Copy Artist Name" content={page.name} icon={Icon.Link} />
          <Action.CopyToClipboard title="Copy Link" content={page.url} icon={Icon.Link} />
          {page.tags.map((tag) => (
            <Action.CopyToClipboard key={tag} title={`Copy Tag "${tag}"`} content={tag} />
          ))}
        </ActionPanel>
      }
    />
  );
}
