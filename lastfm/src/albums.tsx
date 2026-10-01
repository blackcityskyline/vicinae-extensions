import React from "react";
import { Action, ActionPanel, Icon, List, Toast, getPreferenceValues, showToast } from "@raycast/api";

// Hooks
import useTopAlbums from "./hooks/useTopAlbums";

// Types
import type { Album } from "@/types/AlbumResponse";
import { OpenOnSites } from "~/components/open-on";

// `keywords` was absent on every List.Item upstream: the search bar is the field the
// text is typed into, so the list filtered the rows against it and emptied itself as
// you typed — a row titled "привет" is filtered out by the word "hello".

const LastFm: React.FC = () => {
  const { username, apikey, period, limit } = getPreferenceValues();
  const { loading, error, albums } = useTopAlbums({ username, apikey, period, limit });

  if (error !== null) {
    showToast({ style: Toast.Style.Failure, title: "Something went wrong.", message: String(error) });
  }

  return (
    <List isLoading={loading} searchBarPlaceholder="Search albums...">
      <List.Section title="Results">
        {albums.map((a, idx) => {
          const album = a as Album;
          const image =
            album.image?.find((image) => image.size === "large")?.["#text"] || "../assets/default-album.jpeg";
          const { url, name } = album.artist;

          return (
            <List.Item
              key={`${album.name}-${idx}`}
              icon={image}
              title={album.name}
              keywords={[album.name, name]}
              subtitle={name ? `by ${name}` : undefined}
              accessories={album.playcount ? [{ text: `${album.playcount} plays`, icon: Icon.Star }] : []}
              actions={
                <ActionPanel>
                  <Action.OpenInBrowser url={album.url} title="Open on Last.fm" />
                  <OpenOnSites subject={{ artist: name ?? "", name: album.name }} />
                  {url && <Action.OpenInBrowser url={url} title="Open Artist Page on Last.fm" />}
                  <Action.CopyToClipboard title="Copy URL to Clipboard" content={album.url} />
                  <Action.CopyToClipboard title="Copy Album Name to Clipboard" content={album.name} />
                  {name && <Action.CopyToClipboard title="Copy Artist Name to Clipboard" content={name} />}
                </ActionPanel>
              }
            />
          );
        })}
      </List.Section>
    </List>
  );
};

export default LastFm;
