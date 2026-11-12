import { Toast, runInTerminal, showToast } from "@vicinae/api";

import { messageOf } from "~/utils/errors";

/** yt-x's own menus, for the flows a list cannot express. */
export async function runInYtX(args: string[] = []): Promise<void> {
  await launch(["yt-x", ...args], "Could not open yt-x");
}

export async function runInEditor(editor: string, path: string): Promise<void> {
  await launch([editor, path], "Could not open the editor");
}

async function launch(args: string[], failureTitle: string): Promise<void> {
  try {
    await runInTerminal(args);
  } catch (error) {
    await showToast(Toast.Style.Failure, failureTitle, messageOf(error));
  }
}
