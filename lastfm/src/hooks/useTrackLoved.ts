import { useEffect, useState } from "react";
import { getPreferenceValues } from "@raycast/api";

import { getTrackLoved } from "../functions/lastfm";

export function useTrackLoved(artist: string | undefined, track: string | undefined) {
  const { username, apikey } = getPreferenceValues<Preferences>();
  const [isLoved, setIsLoved] = useState<boolean | null>(null);

  useEffect(() => {
    if (!artist || !track) return;
    let cancelled = false;

    // Optional on Vicinae rather than required: a required preference left unset makes
    // Vicinae refuse to start the command and log nothing. See docs/api-porting.md.
    getTrackLoved(artist, track, username ?? "", apikey ?? "")
      .then((loved) => {
        if (!cancelled) setIsLoved(loved);
      })
      .catch(() => {
        if (!cancelled) setIsLoved(null);
      });

    return () => {
      cancelled = true;
    };
  }, [artist, track]);

  return { isLoved, setIsLoved };
}
