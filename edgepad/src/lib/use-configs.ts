import { LocalStorage } from "@vicinae/api";
import { useCallback, useEffect, useMemo, useState } from "react";

import { currentDesktop } from "./cli";
import { discoverConfigs, resolveConfigDir, type ConfigInfo } from "./configs";
import { getPrefs } from "./prefs";

const STORAGE_KEY = "edgepad.configPath";

export type ConfigSelection = {
  configs: ConfigInfo[];
  selected?: string;
  dir: string;
  isLoading: boolean;
  error?: string;
  select: (path: string) => Promise<void>;
  reload: () => Promise<void>;
};

/**
 * The list of configs in the edgepad directory plus the one the user picked
 * last. The stored path survives restarts; a config deleted outside the
 * extension falls back to the session's active file, then to the first one.
 */
export function useConfigs(): ConfigSelection {
  const prefs = useMemo(getPrefs, []);
  const dir = useMemo(() => resolveConfigDir(prefs.configDir), [prefs.configDir]);
  const [configs, setConfigs] = useState<ConfigInfo[]>([]);
  const [selected, setSelected] = useState<string>();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>();

  const reload = useCallback(async () => {
    setIsLoading(true);
    try {
      const desktop = await currentDesktop();
      const found = discoverConfigs(dir, desktop);
      const stored = await LocalStorage.getItem<string>(STORAGE_KEY);
      const pick =
        found.find((config) => config.path === stored)?.path ??
        found.find((config) => config.active)?.path ??
        found[0]?.path;
      setConfigs(found);
      setSelected(pick);
      if (pick && pick !== stored) await LocalStorage.setItem(STORAGE_KEY, pick);
      setError(
        found.length === 0
          ? `No .toml configs in ${dir}. Create one there, or point "Config Directory" at the folder that holds them.`
          : undefined,
      );
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setIsLoading(false);
    }
  }, [dir]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const select = useCallback(async (path: string) => {
    setSelected(path);
    await LocalStorage.setItem(STORAGE_KEY, path);
  }, []);

  return { configs, selected, dir, isLoading, error, select, reload };
}
