import { Cache } from "@raycast/api";
import { useEffect, useState } from "react";

import { MaterialIcon, parseMetadata } from "./icons";

const cache = new Cache({ namespace: "material-icons" });
const CACHE_KEY = "icons";
const CACHE_TTL = 24 * 60 * 60 * 1000;
const METADATA_URL = "https://fonts.google.com/metadata/icons";

type Stored = { savedAt: number; icons: MaterialIcon[] };

function readCache(): MaterialIcon[] | undefined {
  try {
    const raw = cache.get(CACHE_KEY);
    if (!raw) return undefined;

    const stored = JSON.parse(raw) as Stored;
    return Date.now() - stored.savedAt < CACHE_TTL ? stored.icons : undefined;
  } catch {
    return undefined;
  }
}

/** The whole catalogue is one request; both views share this hook. */
export function useIcons() {
  const [icons, setIcons] = useState<MaterialIcon[] | undefined>(readCache);
  const [error, setError] = useState<Error>();

  useEffect(() => {
    if (icons) return;

    let alive = true;
    fetch(METADATA_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`${METADATA_URL} answered ${response.status}`);
        return response.text();
      })
      .then((body) => {
        const parsed = parseMetadata(body);
        if (alive) setIcons(parsed);
        try {
          cache.set(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), icons: parsed } satisfies Stored));
        } catch {
          // The cache is an optimisation; a catalogue that is too big for it still works.
        }
      })
      .catch((reason: unknown) => {
        if (alive) setError(reason instanceof Error ? reason : new Error(String(reason)));
      });

    return () => {
      alive = false;
    };
  }, [icons]);

  return { icons, isLoading: !icons && !error, error };
}
