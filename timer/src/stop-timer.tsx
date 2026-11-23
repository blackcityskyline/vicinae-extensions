import { showHUD, showToast, Toast } from "@vicinae/api";

import { stopAll } from "~/api/timers";

/**
 * The same ending as the list's Stop Timer button, reachable without opening
 * the list: every deadline goes, the alarm is silenced, the music stops.
 */
export default async function StopTimer() {
  const { stopped, problem } = stopAll();
  if (problem) {
    await showToast({ style: Toast.Style.Failure, title: "Could not write the note", message: problem });
  }
  await showHUD(stopped === 0 ? "No timers were running" : `Stopped ${stopped} timer${stopped === 1 ? "" : "s"}`);
}
