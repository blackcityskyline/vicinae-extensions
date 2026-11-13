import { environment, getPreferenceValues } from "@vicinae/api";
import path from "node:path";

type Stored = { nvimPath?: string; layout?: string };

/** `nvim` from PATH unless the preference names another binary. */
export function nvimPath(): string {
  const value = getPreferenceValues<Stored>().nvimPath?.trim();
  return value === undefined || value === "" ? "nvim" : value;
}

/** The three list views render as rows or as a 5-column grid, upstream's preference. */
export function layout(): "list" | "grid" {
  return getPreferenceValues<Stored>().layout === "grid" ? "grid" : "list";
}

/** Upstream's `neovim-recent-dirs.json`, in this extension's support directory. */
export function recentDirsFile(): string {
  return path.join(environment.supportPath, "neovim-recent-dirs.json");
}
