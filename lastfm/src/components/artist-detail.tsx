import React, { useEffect, useState } from "react";
import { Action, ActionPanel, Detail, Icon, getPreferenceValues, open } from "@raycast/api";

import { artistInfo, type ArtistInfo } from "~/functions/browse";
import { imageUrl, stripHtml } from "~/utils/lastfm";

/**
 * One artist, pushed from a row.
 *
 * The reference has no artist page at all — an artist name is a title and a link,
 * and nothing else. This is the page that answers what the row does not: listeners,
 * playcount, tags, similar artists and the bio, which arrive as HTML and are
 * stripped here.
 */
export function ArtistDetail({ name }: { name: string }): React.ReactElement {
  const { apikey } = getPreferenceValues<Preferences>();
  const [info, setInfo] = useState<ArtistInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;

    artistInfo(apikey ?? "", name).then(
      (loaded) => {
        if (live) setInfo(loaded);
      },
      (failure: unknown) => {
        if (live) setError(failure instanceof Error ? failure.message : String(failure));
      },
    );

    return () => {
      live = false;
    };
  }, [apikey, name]);

  if (error) return <Detail markdown={`# ${name}\n\n${error}`} />;
  if (!info) return <Detail markdown={`# ${name}\n\nLoading…`} />;

  return (
    <Detail
      navigationTitle={name}
      markdown={markdown(info, name)}
      actions={
        <ActionPanel>
          <Action.OpenInBrowser url={info.url} title="Open on Last.fm" icon={Icon.Globe} />
          <Action
            title="Open on Monochrome"
            icon={Icon.Play}
            onAction={() => void open(`https://monochrome.st/search/${encodeURIComponent(info.name)}`)}
          />
          <Action.CopyToClipboard title="Copy Artist Name" content={info.name} icon={Icon.Link} />
          <Action.CopyToClipboard title="Copy Link" content={info.url} icon={Icon.Link} />
          {info.tags.map((tag) => (
            <Action.CopyToClipboard key={tag} title={`Copy Tag "${tag}"`} content={tag} />
          ))}
        </ActionPanel>
      }
    />
  );
}

function markdown(info: ArtistInfo, name: string): string {
  const lines = [`# ${name}`];

  if (info.image) lines.push(`![${name}](${info.image})`);

  lines.push(
    "",
    `**${info.listeners}** listeners · **${info.playcount}** plays`,
    "",
    `[Open on Last.fm](${info.url})`,
  );

  if (info.tags.length > 0) {
    lines.push("", "## Tags", "", info.tags.map((tag) => `- ${tag}`).join("\n"));
  }

  if (info.bio) {
    lines.push("", "## About", "", stripHtml(info.bio));
  }

  if (info.similar.length > 0) {
    lines.push("", "## Similar", "", info.similar.map((artist) => `- [${artist.name}](${artist.url})`).join("\n"));
  }

  return lines.join("\n");
}

/** Kept exported so the image helper is not tree-shaken away from the module. */
export { imageUrl };