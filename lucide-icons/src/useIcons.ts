import { Cache } from "@raycast/api";
import { useEffect, useState } from "react";

import { buildIcons, IconNodes, LucideIcon } from "./icons";

const cache = new Cache({ namespace: "lucide-icons" });
const CACHE_KEY = "icons";
const CACHE_TTL = 24 * 60 * 60 * 1000;

type Tags = Record<string, string[]>;
type Stored = { savedAt: number; icons: LucideIcon[] };

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return (await response.json()) as T;
}

function readCache(): LucideIcon[] | undefined {
  try {
    const raw = cache.get(CACHE_KEY);
    if (!raw) return undefined;

    const stored = JSON.parse(raw) as Stored;
    return Date.now() - stored.savedAt < CACHE_TTL ? stored.icons : undefined;
  } catch {
    return undefined;
  }
}

/** The three endpoints are fetched together: one icon set is incomplete without all three. */
export function useIcons() {
  const [icons, setIcons] = useState<LucideIcon[] | undefined>(readCache);
  const [error, setError] = useState<Error>();

  useEffect(() => {
    if (icons) return;

    let alive = true;
    Promise.all([
      readJson<IconNodes>("https://lucide.dev/api/icon-nodes"),
      readJson<Tags>("https://lucide.dev/api/tags"),
      readJson<Tags>("https://lucide.dev/api/categories"),
    ])
      .then(([nodes, tags, categories]) => {
        const built = buildIcons(nodes, tags, categories);
        if (alive) setIcons(built);
        try {
          cache.set(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), icons: built } satisfies Stored));
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
