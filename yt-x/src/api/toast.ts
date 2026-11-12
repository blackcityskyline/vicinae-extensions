import { Toast, showToast } from "@vicinae/api";

import { messageOf } from "~/utils/errors";

/** Run an action and report its failure without taking the view down. */
export async function attempt(failureTitle: string, task: () => void | Promise<void>): Promise<void> {
  try {
    await task();
  } catch (error) {
    await showToast(Toast.Style.Failure, failureTitle, messageOf(error));
  }
}

export async function succeeded(title: string, message?: string): Promise<void> {
  await showToast(Toast.Style.Success, title, message);
}
