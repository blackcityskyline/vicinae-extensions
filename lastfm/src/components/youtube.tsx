import { Action, Icon, open } from "@vicinae/api";

import { youtubeMusicSearchUrl, youtubeQuery } from "~/utils/youtube";

/**
 * Searches YouTube Music for the artist and title, and opens it in the default
 * browser. One component so the query is built the same way in all eight places
 * it appears.
 */
export function OpenInYouTubeMusic({ artist, name }: { artist?: string; name: string }) {
  return (
    <Action
      title="Open in YouTube Music"
      icon={Icon.Play}
      onAction={() => void open(youtubeMusicSearchUrl(youtubeQuery({ artist, name })))}
    />
  );
}
