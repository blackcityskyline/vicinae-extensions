import { showToast, Toast } from "@vicinae/api";

import { openInNvim } from "~/lib/open";
import os from "node:os";
import { nvimPath } from "~/lib/preferences";

/** A `no-view` command: no clipboard, no list, one terminal. */
export default async function OpenNewWindow(): Promise<void> {
  try {
    await openInNvim(nvimPath(), [], os.homedir());
  } catch (error) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Could not start Neovim",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
