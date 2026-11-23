import { Toast, getPreferenceValues, showToast } from "@vicinae/api";

import { resume } from "~/api/backend";
import { buildMusicConfig } from "~/api/player";

/** Plays the last queue again: the daemon resumes its entry and position, the plain mpv starts over. */
export default async function playLatest(): Promise<void> {
  const config = buildMusicConfig(getPreferenceValues<Preferences>());

  try {
    if (await resume(config)) return;
    await showToast(
      Toast.Style.Failure,
      "Nothing to resume",
      "Play a playlist first: the player keeps the last one for this command.",
    );
  } catch (error) {
    await showToast(
      Toast.Style.Failure,
      "Could not resume the last playback",
      error instanceof Error ? error.message : String(error),
    );
  }
}
