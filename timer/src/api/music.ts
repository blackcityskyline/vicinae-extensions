import { environment } from "@vicinae/api";
import { spawn } from "node:child_process";

import { mpvArgs } from "../utils/music.ts";

/**
 * mpv has to outlive the worker that started it: the window closes, the timer
 * keeps running. Detached, no stdio, and the pid goes back to the caller.
 *
 * A missing mpv arrives as an async `error` event, so the callback is not
 * optional: without a handler the worker dies on an unhandled event.
 */
export function spawnMusic(url: string, volume: number, onFailure: (error: Error) => void): number | null {
  try {
    const child = spawn("mpv", mpvArgs(url, volume, environment.assetsPath), {
      detached: true,
      stdio: "ignore",
    });
    child.on("error", onFailure);
    child.unref();
    return child.pid ?? null;
  } catch (error) {
    onFailure(error as Error);
    return null;
  }
}
