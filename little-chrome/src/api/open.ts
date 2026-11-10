import { getPreferenceValues } from "@vicinae/api";

import { currentProfile, findBrowser, installedTitles, userDataDir, type BrowserDef } from "~/api/browser.ts";
import { openAppWindow, parseSize, type WindowSize } from "~/api/launch.ts";

export interface BrowserContext {
  def: BrowserDef;
  bin: string;
  /** The history directory; it may not exist on a browser that was never started. */
  dir: string;
  profile: string;
  size: WindowSize;
}

export type ContextResult = { context: BrowserContext } | { error: string };

export function windowSize(): WindowSize {
  const prefs = getPreferenceValues<Preferences>();
  return { width: parseSize(prefs.width, 900), height: parseSize(prefs.height, 700) };
}

/** Resolves the configured browser, or explains what to install or pick. */
export function resolveContext(): ContextResult {
  const prefs = getPreferenceValues<Preferences>();
  const found = findBrowser(prefs.browser ?? "auto");
  if (!found) {
    const installed = installedTitles();
    if (installed.length === 0) {
      return {
        error: "No Chromium-family browser found. Install Helium, Chromium, Thorium, Brave or Chrome.",
      };
    }
    return {
      error: `${prefs.browser} is not installed. Available: ${installed.join(", ")}. Pick one in the extension preferences.`,
    };
  }
  const dir = userDataDir(found.def);
  return { context: { ...found, dir, profile: currentProfile(dir), size: windowSize() } };
}

/** Opens `url` in the configured browser. Returns the reason it failed, or undefined on success. */
export async function openFromPreferences(url: string): Promise<string | undefined> {
  const resolved = resolveContext();
  if ("error" in resolved) return resolved.error;
  try {
    await openAppWindow(resolved.context.bin, url, resolved.context.size);
    return undefined;
  } catch (error) {
    return `Could not start ${resolved.context.def.title}: ${error instanceof Error ? error.message : String(error)}`;
  }
}
