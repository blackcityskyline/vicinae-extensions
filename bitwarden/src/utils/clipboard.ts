import { Clipboard, Toast, closeMainWindow, getPreferenceValues, popToRoot, showHUD, showToast } from "@vicinae/api";
import { capitalize } from "~/utils/strings";

/**
 * Confirms a copy.
 *
 * The window closes by default so the user lands back in whatever they were
 * typing into; `windowActionOnCopy: keepOpen` keeps the list in place instead.
 */
export async function showCopySuccessMessage(title: string, message?: string) {
  const { windowActionOnCopy } = getPreferenceValues<Preferences>();
  const messageTitle = capitalize(title, true);

  if (windowActionOnCopy === "keepOpen") {
    await showToast({ title: messageTitle, message, style: Toast.Style.Success });
    return;
  }

  await showHUD(messageTitle);
  await popToRoot();
}

/**
 * Pastes into the window behind the launcher.
 *
 * `Clipboard.paste` only hands the paste over once another window has focus: with
 * the launcher still open, the keystroke lands in its search bar (or the handoff
 * times out). Closing first sends focus back to where the user came from.
 */
export async function pasteIntoFocusedWindow(content: string | number | Clipboard.Content): Promise<void> {
  await closeMainWindow();
  await Clipboard.paste(content);
}
