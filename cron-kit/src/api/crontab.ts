import { execFile, spawn } from "node:child_process";

import { parseCrontab, renderCrontab, type CrontabLine } from "~/utils/crontab";

export type CrontabRead = { ok: true; value: string } | CrontabFailure;
export type CrontabWrite = { ok: true } | CrontabFailure;
type CrontabFailure = { ok: false; message: string };

const NOT_INSTALLED =
  "The crontab command was not found. Install cron first — on Arch that is `sudo pacman -S cronie`.";

const NO_CRONTAB = /no crontab for/i;

type Run = { code: number; stdout: string; stderr: string } | { missing: true };

function run(args: string[], stdin?: string): Promise<Run> {
  if (stdin === undefined) {
    return new Promise((resolve) => {
      execFile("crontab", args, { encoding: "utf8" }, (error, stdout, stderr) => {
        if (!error) return resolve({ code: 0, stdout, stderr });
        const failure = error as NodeJS.ErrnoException;
        if (failure.code === "ENOENT") return resolve({ missing: true });
        return resolve({
          code: typeof failure.code === "number" ? failure.code : 1,
          stdout,
          stderr: stderr || failure.message,
        });
      });
    });
  }

  // `crontab -` reads the new crontab from stdin and execFile cannot supply one.
  return new Promise((resolve) => {
    const child = spawn("crontab", args, { stdio: ["pipe", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", () => resolve({ missing: true }));
    child.on("close", (code) => resolve({ code: code ?? 0, stdout: "", stderr }));
    child.stdin.end(stdin);
  });
}

export async function readCrontab(): Promise<CrontabRead> {
  const result = await run(["-l"]);
  if ("missing" in result) return { ok: false, message: NOT_INSTALLED };
  if (result.code === 0) return { ok: true, value: result.stdout };
  // Having no crontab at all is not a failure, it is an empty crontab.
  if (NO_CRONTAB.test(result.stderr)) return { ok: true, value: "" };
  return { ok: false, message: result.stderr.trim() || "crontab -l failed" };
}

/**
 * Applies an edit to the crontab.
 *
 * The read and the write happen here, in one place, and nothing is written
 * unless the read succeeded: `crontab -l` failing for any other reason would
 * otherwise turn "I could not read your crontab" into "your crontab is empty".
 *
 * `edit` works on lines and is handed the crontab as it is right now, so a
 * change made outside the extension in between is carried into the result
 * instead of being overwritten. Returning `{ error }` cancels the write.
 */
export async function updateCrontab(
  edit: (lines: CrontabLine[]) => CrontabLine[] | { error: string },
): Promise<CrontabWrite> {
  const current = await readCrontab();
  if (!current.ok) return current;

  const edited = edit(parseCrontab(current.value));
  if (!Array.isArray(edited)) return { ok: false, message: edited.error };

  const written = await run(["-"], renderCrontab(edited));
  if ("missing" in written) return { ok: false, message: NOT_INSTALLED };
  // crontab validates the schedule itself and says exactly what it disliked,
  // so its wording is the message rather than a paraphrase of it.
  if (written.code === 0) return { ok: true };
  return { ok: false, message: written.stderr.trim() || "crontab rejected the result" };
}
