import { execFile, spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import { promisify } from "node:util";

import { runInTerminal, showToast, Toast } from "@vicinae/api";

import type { Repository } from "./github.ts";
import { clonePathFor, editorLaunch, httpsCloneUrl, INSTALL_HINTS } from "../utils/launch.ts";

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
 * Clone the repository unless it is already there, and return where it landed.
 *
 * Each failure reports its own toast: a missing `git`, a non-empty target
 * directory and a network problem are three different things and the user has
 * to act on them differently. Returns null when the clone did not happen, so a
 * caller never launches an editor on a path that is not there.
 */
export async function cloneRepository(
  repository: Pick<Repository, "html_url" | "full_name">,
  cloneRoot: string,
): Promise<string | null> {
  const target = clonePathFor(cloneRoot, repository.full_name);
  if (await isDirectory(target)) return target;

  await showToast({ title: `Cloning ${repository.full_name}...`, style: Toast.Style.Animated });

  try {
    await run("git", ["clone", "--", httpsCloneUrl(repository.html_url), target], {
      timeout: 10 * 60 * 1000,
    });
    return target;
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr ?? "";
    const detail = /already exists and is not an empty directory/i.test(stderr)
      ? "that directory already exists and is not an empty Git clone"
      : (error as Error).message;
    await showToast({ title: `Clone failed: ${detail}`, style: Toast.Style.Failure });
    return null;
  }
}

/**
 * Open an existing checkout in the configured editor.
 *
 * GUI editors are spawned detached so they outlive the extension process.
 * Terminal editors cannot be: `nvim` or `emacs` without a TTY print
 * "Output is not to a terminal", so those are launched in a terminal window with
 * the repository as its working directory.
 */
export async function openInEditor(editor: string, target: string): Promise<void> {
  const launch = editorLaunch(editor, target);
  if (launch === null) {
    await showToast({ title: "No editor configured", style: Toast.Style.Failure });
    return;
  }

  try {
    if (launch.kind === "terminal") {
      await runInTerminal(launch.args, { workingDirectory: target, hold: true });
      return;
    }

    spawn(launch.command, launch.args, { detached: true, stdio: "ignore" }).unref();
    await showToast({ title: `Opened in ${launch.command}`, style: Toast.Style.Success });
  } catch (error) {
    const hint = editor in INSTALL_HINTS ? INSTALL_HINTS[editor as keyof typeof INSTALL_HINTS] : undefined;
    await showToast({ title: `Could not launch ${editor}`, message: hint, style: Toast.Style.Failure });
    console.error(`launch ${editor} failed:`, (error as Error).message);
  }
}

/** Clone if needed, then open. The combined path behind Open in Editor. */
export async function cloneAndOpenInEditor(
  repository: Pick<Repository, "html_url" | "full_name">,
  editor: string,
  cloneRoot: string,
): Promise<void> {
  const target = await cloneRepository(repository, cloneRoot);
  if (target === null) return;
  await openInEditor(editor, target);
}
