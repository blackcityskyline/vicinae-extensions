import { showToast, Toast } from "@vicinae/api";

import { toggleBypass } from "~/api/easyeffects";
import { toastFailure, toastStopped } from "~/api/toast";

/** Global bypass for a keybinding: every effect on or off at once. */
export default async function ToggleEffects() {
  try {
    const bypassed = await toggleBypass();
    if (bypassed === null) {
      toastStopped();
      return;
    }
    void showToast({
      style: Toast.Style.Success,
      title: bypassed ? "Effects bypassed" : "Effects on",
      message: bypassed ? "Every effect is skipped until you turn it back on." : "The active preset is applied.",
    });
  } catch (error) {
    toastFailure(error);
  }
}
