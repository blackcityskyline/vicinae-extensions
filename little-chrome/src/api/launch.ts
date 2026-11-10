import { spawn } from "node:child_process";

export interface WindowSize {
  width: number;
  height: number;
}

/** Whole pixels from a text preference, or the fallback. */
export function parseSize(value: string | undefined, fallback: number): number {
  const size = Number.parseInt((value ?? "").trim(), 10);
  return Number.isFinite(size) && size > 0 ? size : fallback;
}

/**
 * Opens a chromeless window through the browser's own app mode. Detached on
 * purpose: the browser must outlive the launcher, and the window is the point of
 * the command.
 */
export function openAppWindow(bin: string, url: string, size: WindowSize): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, [`--app=${url}`, `--window-size=${size.width},${size.height}`], {
      detached: true,
      stdio: "ignore",
    });
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
    child.once("error", reject);
  });
}
