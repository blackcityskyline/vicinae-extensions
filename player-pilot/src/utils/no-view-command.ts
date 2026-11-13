import { closeMainWindow, showToast, Toast } from "@vicinae/api";
import { executePlaybackAction, type PlayerCtlPlaybackAction } from "./playerctl";
import { getPreferredPlayerNames } from "./preferences";

/**
 * Shared body of the four no-view commands.
 */
export default async function executeNoViewCommand(action: PlayerCtlPlaybackAction) {
  const preferredPlayerNames = getPreferredPlayerNames();

  try {
    if (preferredPlayerNames === undefined) {
      await executePlaybackAction(action);
    } else {
      // Awaited: an unawaited rejection is silent and the window still closes.
      await Promise.all(preferredPlayerNames.map((name) => executePlaybackAction(action, name)));
    }
  } catch (error) {
    await showToast(Toast.Style.Failure, `playerctl ${action} failed`, String(error));
    return;
  }

  await closeMainWindow();
}
