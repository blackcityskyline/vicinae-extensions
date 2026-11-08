import { showToast, Toast } from "@vicinae/api";

import { loadPreset, readState } from "~/api/easyeffects";
import { toastFailure, toastLoaded, toastStopped } from "~/api/toast";
import { stepPreset } from "~/utils/state";

/** Shared by the Next and Previous commands, so both walk the same list. */
export async function cyclePreset(direction: 1 | -1): Promise<void> {
  try {
    const state = await readState();
    if (!state.running) {
      toastStopped();
      return;
    }
    const next = stepPreset(state.presets, state.preset, direction);
    if (!next) {
      void showToast({
        style: Toast.Style.Failure,
        title: "No other output preset",
        message: "Save a second preset in Easy Effects to step through them.",
      });
      return;
    }
    if (!(await loadPreset(next))) {
      toastStopped();
      return;
    }
    toastLoaded(next);
  } catch (error) {
    toastFailure(error);
  }
}
