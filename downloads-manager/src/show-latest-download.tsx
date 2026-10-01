import { popToRoot, showHUD, showInFinder, closeMainWindow } from "@raycast/api";
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

  // The launcher window is closed first, then the file is revealed.
  //
  // Upstream reveals first and closes afterwards. On Linux that shows nothing, and the
  // reason is focus: Nautilus is asked to raise itself over a window that is still
  // there and still has focus, and then the launcher closes and the compositor hands
  // focus back. Measured on this machine — `ShowItems` on an already-open folder
  // changes no window count and no focus, and leaves the active window on whatever
  // had it.
  //
  // Vicinae itself orders it this way in `Action.Paste`, with the comment "we close
  // before pasting to make sure focus has been properly restored".
  await closeMainWindow();
  await showInFinder(latestDownload.path);
  await popToRoot();
}
