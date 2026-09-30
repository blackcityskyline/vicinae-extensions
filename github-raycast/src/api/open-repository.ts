import { execFile, spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import { promisify } from "node:util";

import { showToast, Toast } from "@vicinae/api";

import type { Repository } from "./github.ts";
import { clonePathFor, editorBinary, httpsCloneUrl, INSTALL_HINTS } from "../utils/launch.ts";

const run = promisify(execFile);

/**
 * Cloning and launching an editor. Lives in `api/` because it spawns processes
 * and touches the filesystem, and because importing `@vicinae/api` would break
 * the headless checks in `test/`.
 */

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Clone the repository if it is not already present, then open it in the
 * configured editor.
 *
 * Each failure reports its own toast: a missing `git`, a non-empty target
 * directory and a missing editor binary are three different problems and the
 * user has to act on them differently.
 */
export async function cloneAndOpenInEditor(
  repository: Pick<Repository, "html_url" | "full_name">,
  editor: string | undefined,
  cloneRoot: string,
): Promise<void> {
  const binary = editorBinary(editor ?? "");
  if (binary === undefined) {
    await showToast({ title: "No editor configured", style: Toast.Style.Failure });
    return;
  }

  const target = clonePathFor(cloneRoot, repository.full_name);

  try {
    if (!(await isDirectory(target))) {
      await showToast({ title: `Cloning ${repository.full_name}...`, style: Toast.Style.Animated });

      try {
        await run("git", ["clone", "--", httpsCloneUrl(repository.html_url), target], { timeout: 10 * 60 * 1000 });
      } catch (error) {
        const stderr = (error as { stderr?: string }).stderr ?? "";
        const detail = /already exists and is not an empty directory/i.test(stderr)
          ? "that directory already exists and is not an empty Git clone"
          : (error as Error).message;
        await showToast({ title: `Clone failed: ${detail}`, style: Toast.Style.Failure });
        return;
      }
    }

    // spawn, not execFile: only spawn accepts `detached`, and the editor has to
    // outlive the extension process.
    spawn(binary, [target], { detached: true, stdio: "ignore" }).unref();
    await showToast({ title: `Opened ${repository.full_name} in ${binary}`, style: Toast.Style.Success });
  } catch (error) {
    const hint = editor !== undefined && editor in INSTALL_HINTS ? INSTALL_HINTS[editor as keyof typeof INSTALL_HINTS] : undefined;
    await showToast({
      title: `Could not launch ${binary}`,
      message: hint,
      style: Toast.Style.Failure,
    });
    console.error(`launch ${binary} failed:`, (error as Error).message);
  }
}
