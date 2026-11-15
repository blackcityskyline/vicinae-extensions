import { Toast, showToast } from "@vicinae/api";

export async function showFailure(title: string, error: unknown): Promise<void> {
  await showToast({
    style: Toast.Style.Failure,
    title,
    message: error instanceof Error ? error.message : String(error),
  });
}
