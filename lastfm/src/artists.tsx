import React from "react";
import { Action, ActionPanel, Icon, List, Toast, getPreferenceValues, showToast } from "@raycast/api";

// Hooks
import useTopArtists from "./hooks/useTopArtists";

// Types
import type { Artist } from "@/types/ArtistResponse";
import { OpenOnSites } from "~/components/open-on";

// `keywords` was absent on every List.Item upstream: the search bar is the field the
// text is typed into, so the list filtered the rows against it and emptied itself as
// you typed — a row titled "привет" is filtered out by the word "hello".

const LastFm: React.FC = () => {
  const { username, apikey, period, limit } = getPreferenceValues();
  const { loading, error, artists } = useTopArtists({ username, apikey, period, limit });

  if (error !== null) {
    showToast({ style: Toast.Style.Failure, title: "Something went wrong.", message: String(error) });
  }

  return (
    <List isLoading={loading} searchBarPlaceholder="Search artists...">
      <List.Section title="Results">
        {artists.map((a, idx) => {
          const artist = a as Artist;
          const image = artist.image.find((image) => image.size === "large")?.["#text"];

          return (
            <List.Item
              key={`${artist.name}-${idx}`}
              icon={image}
              title={artist.name}
              keywords={[artist.name]}
              accessories={artist.playcount ? [{ text: `${artist.playcount} plays`, icon: Icon.Star }] : []}
              actions={
                <ActionPanel>
                  <Action.OpenInBrowser url={artist.url} title="Open on Last.fm" />
                  <OpenOnSites subject={{ name: artist.name }} />
                  <Action.CopyToClipboard title="Copy URL to Clipboard" content={artist.url} />
                  <Action.CopyToClipboard title="Copy Name to Clipboard" content={artist.name} />
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
