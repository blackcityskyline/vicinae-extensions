import { popToRoot, showHUD, Clipboard, closeMainWindow } from "@raycast/api";
import { showFailureToast } from "@raycast/utils";
import { getLatestDownload, hasAccessToDownloadsFolder } from "./utils";

export default async function main() {
  if (!hasAccessToDownloadsFolder()) {
    await showHUD("No permission to access the downloads folder");
    return;
  }

  let download;
  try {
    download = getLatestDownload();
  } catch (error) {
    await showFailureToast(error, { title: "Could not get latest download" });
    return;
  }

  if (!download) {
    await showHUD("No downloads found");
    return;
  }

  try {
    // Closed first, then pasted — the same order Vicinae's own `Action.Paste` uses,
    // with the comment "we close before pasting to make sure focus has been properly
    // restored". Upstream pastes while the launcher still holds focus, so the paste can
    // land in the launcher instead of the window the user came from. Same defect as in
    // `show-latest-download`, where the file manager is asked to raise itself over a
    // window that is still there and still focused.
    await closeMainWindow();
    await Clipboard.paste({ file: download.path });
    await showHUD("Pasted latest download");
    await popToRoot();
  } catch (error) {
    await showFailureToast(error, { title: "Could not paste download" });
  }
}
