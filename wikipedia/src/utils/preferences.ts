import { getPreferenceValues } from "@vicinae/api";

/**
 * Read once: preferences do not change while a command runs. `Preferences`
 * carries the extension-level keys, the command's own are merged into the same
 * object at runtime.
 */
const preferences = getPreferenceValues<Preferences.SearchPage>();

export const opensInBrowser = preferences.openIn === "browser";
export const prefersListView = preferences.viewType !== "grid";
