import { showToast, Toast } from "@vicinae/api";

export function toastFailure(error: unknown): void {
  const code = (error as NodeJS.ErrnoException).code;
  void showToast({
    style: Toast.Style.Failure,
    title: "Easy Effects did not respond",
    message:
      code === "ENOENT"
        ? "Install Easy Effects, or put `easyeffects` in PATH."
        : "The command failed or timed out. Try again.",
  });
}

export function toastStopped(): void {
  void showToast({
    style: Toast.Style.Failure,
    title: "Easy Effects is not running",
    message: "Open Easy Effects, then try again.",
  });
}

export function toastLoaded(preset: string): void {
  void showToast({ style: Toast.Style.Success, title: "Preset loaded", message: preset });
}
