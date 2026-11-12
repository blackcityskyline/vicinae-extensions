import { getPreferenceValues } from "@vicinae/api";

type Stored = { nvimPath?: string };

/** `nvim` from PATH unless the preference names another binary. */
export function nvimPath(): string {
  const value = getPreferenceValues<Stored>().nvimPath?.trim();
  return value === undefined || value === "" ? "nvim" : value;
}
