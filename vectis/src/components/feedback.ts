import { showToast, Toast } from "@vicinae/api";

import type { VectisResult } from "~/api/vectis";

/**
 * Reports a vectis call to the user.
 *
 * Every failure gets its own toast, because the classified messages differ in
 * what the user must do next: start the daemon, unlock the session, or pick a
 * different value. One generic "failed" would make all three look alike.
 */
export async function reportResult<T>(
  result: VectisResult<T>,
  successTitle: string,
  successMessage?: string,
): Promise<boolean> {
  if (result.ok) {
    await showToast({ style: Toast.Style.Success, title: successTitle, message: successMessage });
    return true;
  }

  await showToast({ style: Toast.Style.Failure, title: "Vectis failed", message: result.failure.message });
  return false;
}
