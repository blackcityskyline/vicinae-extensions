import { Cache, LocalStorage, showToast, Toast } from "@raycast/api";
import { homedir } from "node:os";
import path from "node:path";
import { useCallback, useEffect, useState } from "react";
import { fileBackend } from "../core/file-backend";
import { mergeLegacyZones } from "../core/migrate";
import {
  loadLocationsFile,
  parseLocationsFile,
  serializeLocationsFile,
  updateLocationsFile,
  type LocationsFile,
  type StorageBackend,
} from "../core/store";
import type { Location } from "../core/types";
import { loadSeed } from "./data";
import { getPrefs } from "./prefs";

const KEY = "locations-v1";

const localBackend: StorageBackend = {
  read: () => LocalStorage.getItem<string>(KEY),
  write: (text) => LocalStorage.setItem(KEY, text),
};

/** Expands a leading "~" or "~/" to the home directory; other paths resolve as absolute. */
export function expandHome(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return path.join(homedir(), p.slice(2));
  if (path.isAbsolute(p)) return path.normalize(p);
  throw new Error(`The locations file path must start with / or ~: "${p}".`);
}

export function currentBackend(): { backend: StorageBackend; file?: string } {
  const f = getPrefs().locationsFile?.trim();
  if (!f) return { backend: localBackend };
  const full = expandHome(f);
  return { backend: fileBackend(full), file: full };
}

export async function readLocations(): Promise<LocationsFile> {
  await importLegacyZones();
  return loadLocationsFile(currentBackend().backend, loadSeed());
}

const LEGACY_MARKER = "merged-in-the-time-zone";

/**
 * One-time import of the list the retired `in-the-time-zone` extension saved, so the merge does not silently
 * drop it. The marker makes every later read a single lookup.
 */
async function importLegacyZones(): Promise<void> {
  if (await LocalStorage.getItem<string>(LEGACY_MARKER)) return;
  const [rawIds, base] = await Promise.all([
    LocalStorage.getItem<string>("zones"),
    LocalStorage.getItem<string>("base"),
  ]);
  const { backend } = currentBackend();
  const current = await loadLocationsFile(backend, loadSeed());
  const added = mergeLegacyZones(rawIds ?? undefined, base ?? undefined, current.locations);
  if (added.length) await updateLocationsFile(backend, loadSeed(), (file) => ({ locations: [...file.locations, ...added] }));
  await LocalStorage.setItem(LEGACY_MARKER, "1");
}

export type LocationsUpdate = Partial<LocationsFile> | ((current: LocationsFile) => Partial<LocationsFile>);

/**
 * The last list each backend produced, readable without waiting. Raycast re-runs a menu bar command every time
 * its menu opens, so without this the first frame has no locations: the title collapses to the icon and the
 * dropdown is empty until the store has been read, which shows as a flicker.
 */
const cache = new Cache({ namespace: "locations" });

function cacheKey(): string | undefined {
  try {
    return currentBackend().file ?? "local";
  } catch {
    return undefined;
  }
}

function cachedFile(): LocationsFile | undefined {
  const key = cacheKey();
  return key ? parseLocationsFile(cache.get(key)) : undefined;
}

function remember(file: LocationsFile): void {
  const key = cacheKey();
  if (key) cache.set(key, serializeLocationsFile(file));
}

// All writes go through one chain: each read-modify-write sees the previous one's result.
let chain: Promise<unknown> = Promise.resolve();

export function useLocations() {
  const [file, setFile] = useState<LocationsFile | undefined>(cachedFile);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  useEffect(() => {
    let active = true;
    readLocations()
      .then((f) => {
        remember(f);
        if (active) setFile(f);
      })
      .catch((e: unknown) => active && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  /** Applies an update to the freshly read file. Shows a toast and rethrows when the write fails. */
  const save = useCallback(async (update: LocationsUpdate): Promise<void> => {
      const run = async () => {
        const merged = await updateLocationsFile(currentBackend().backend, loadSeed(), (current) =>
          typeof update === "function" ? update(current) : update,
        );
        remember(merged);
        setFile(merged);
      };
      const result = chain.then(run, run);
      chain = result.catch(() => undefined);
      try {
        await result;
      } catch (e) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Could not save locations",
          message: e instanceof Error ? e.message : String(e),
        });
        throw e;
      }
    },
    [],
  );

  const setLocations = useCallback((locations: Location[]) => save({ locations }), [save]);
  return { file, locations: file?.locations, isLoading: loading, error, save, setLocations };
}
