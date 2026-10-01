import { execFile } from "node:child_process";

/**
 * Moving something to the trash.
 *
 * Vicinae's `trash()` is `rm -r`:
 *
 *     const trash = async (path) => {
 *       const targets = Array.isArray(path) ? path : [path];
 *       const promises = targets.map((p) => rm(p, { recursive: true }));
 *       await Promise.all(promises);
 *     };
 *
 * It removes the file and calls that a trash. The upstream extension shows "Item Moved
 * to Trash" and "Move to Trash Failed" around it, so deploying it as it stands means a
 * permission slip deletes a download forever with no way back — the one outcome the
 * whole feature exists to prevent.
 *
 * `gio trash` is the freedesktop implementation and it is already installed:
 * `/usr/bin/gio`. It writes the file into `$XDG_DATA_HOME/Trash/files` with a
 * `.trashinfo` beside it recording the original path, which is what makes "Put Back"
 * possible. Measured on this machine:
 *
 *   gio trash ~/Downloads/probe.txt   -> 0, gone from ~/Downloads,
 *                                         present in ~/.local/share/Trash/files
 *
 * It refuses paths on a system-internal mount with "Trashing on system internal mounts
 * is not supported" — verified on `/tmp`. That is a refusal, not a deletion, so it is
 * safe to surface; nothing is lost when it happens.
 *
 * No shell: `execFile` with an argv array, so a download called
 * `it's "quoted"; rm -rf $HOME.txt` cannot execute anything.
 */

const GIO = "gio";

/**
 * Move each path to the trash, and say which ones went.
 *
 * A batch that only partly worked must not be reported as a whole success, and it must
 * not be reported as a whole failure either: the caller drops the trashed rows from the
 * list and tells the user how many did not go. Deciding that by whether the path still
 * exists afterwards is wrong — a path that was never there is not a file that moved.
 * The outcome of each call is the only honest answer.
 */
export async function trashEach(path: string | string[]): Promise<{
  trashed: string[];
  failed: { path: string; reason: string }[];
}> {
  const paths = Array.isArray(path) ? path : [path];
  const trashed: string[] = [];
  const failed: { path: string; reason: string }[] = [];

  // One call per path: gio takes several, but then one refusal fails the batch and
  // nothing can be told apart. Per-path keeps every failure attributable.
  for (const target of paths) {
    try {
      await execFileAsync(GIO, ["trash", "--", target]);
      trashed.push(target);
    } catch (error) {
      failed.push({ path: target, reason: reason(error) });
    }
  }

  return { trashed, failed };
}

/** One path, or all of them, with no answer about which. Throws if any did not go. */
export async function trashOnLinux(path: string | string[]): Promise<void> {
  const { failed } = await trashEach(path);

  if (failed.length === 0) return;

  const detail = failed.map((entry) => `${entry.path}: ${entry.reason}`).join("\n");

  throw new Error(
    failed.length === 1
      ? `Could not move to Trash:\n${detail}`
      : `Could not move ${failed.length} items to Trash:\n${detail}`,
  );
}

function reason(error: unknown): string {
  const detail = stderr(error) || (error instanceof Error ? error.message : String(error));
  return detail || "gio gave no reason";
}

/**
 * `execFile` rejects with the error, and the reason is only in `stderr` — an ENOENT
 * from gio prints nothing there and lands in `message`, while "Trashing on system
 * internal mounts" is entirely on `stderr`. Both are read so no refusal comes back
 * blank.
 */
function stderr(error: unknown): string {
  const raw = (error as { stderr?: unknown } | null)?.stderr;
  if (typeof raw !== "string") return "";
  return raw.trim();
}

function execFileAsync(file: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { maxBuffer: 1024 * 1024 }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}
