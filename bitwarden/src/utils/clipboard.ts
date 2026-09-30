import { Toast, getPreferenceValues, popToRoot, showHUD, showToast } from "@vicinae/api";
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
