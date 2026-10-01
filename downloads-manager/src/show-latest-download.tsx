import { popToRoot, showHUD, closeMainWindow } from "@raycast/api";

import { runReveal } from "./focus";
import { getLatestDownload, hasAccessToDownloadsFolder } from "./utils";

export default async function main() {
  if (!hasAccessToDownloadsFolder()) {
    await showHUD("No permission to access the downloads folder");
    return;
  }

  const latestDownload = getLatestDownload();
  if (!latestDownload) {
    await showHUD("No downloads found");
    return;
  }

  // Not `showInFinder()`. That resolves to Nautilus's `ShowItems`, which is a no-op when
  // the folder's window is already open — measured, no window and no focus change. This
  // switches focus to that window instead, and only asks for a new one when there is
  // none. `Open in New Window` forces the second half.
  runReveal(latestDownload.path);

  await closeMainWindow();
  await popToRoot();
}
