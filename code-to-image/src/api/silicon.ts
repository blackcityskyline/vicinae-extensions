import { execFile, spawn } from "node:child_process";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import * as path from "node:path";

import type { Result } from "~/api/codetoimage";
import { fileName, type Choice } from "~/utils/snippet";
import { parseThemeList, siliconErrorMessage } from "~/utils/silicon";

const INSTALL_HINT =
  "silicon is not installed. Install it with: sudo pacman -S silicon";

function startErrorMessage(error: Error): string {
  return (error as NodeJS.ErrnoException).code === "ENOENT"
    ? INSTALL_HINT
    : `silicon failed to start: ${error.message}`;
}

export function loadSiliconThemes(): Promise<Result<Choice[]>> {
  return new Promise((resolve) => {
    execFile(
      "silicon",
      ["--list-themes"],
      { timeout: 10_000 },
      (error, stdout) => {
        if (error) {
          resolve({ error: new Error(startErrorMessage(error)) });
          return;
        }
        const themes = parseThemeList(stdout);
        if (themes.length === 0) {
          resolve({
            error: new Error(
              "silicon listed no themes. Its syntax cache may be empty; run `silicon --build-cache ~/.cache/silicon`.",
            ),
          });
          return;
        }
        resolve({ result: themes });
      },
    );
  });
}

export type SiliconInput = {
  code: string;
  language: string;
  theme: string;
  lineNumbers: boolean;
  windowControls: boolean;
  folder: string;
};

export async function renderWithSilicon(input: SiliconInput): Promise<Result<string>> {
  const target = path.join(input.folder, fileName(new Date(), "png"));
  const partial = `${target}.part.png`;
  try {
    await mkdir(input.folder, { recursive: true });
  } catch (error) {
    return { error: new Error(`Cannot create ${input.folder}: ${(error as Error).message}`) };
  }

  const args = [
    "--language",
    input.language,
    "--theme",
    input.theme,
    "--output",
    partial,
  ];
  if (!input.lineNumbers) args.push("--no-line-number");
  if (!input.windowControls) args.push("--no-window-controls");

  return new Promise((resolve) => {
    let stderr = "";
    let settled = false;
    const finish = (result: Result<string>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const child = spawn("silicon", args, { stdio: ["pipe", "ignore", "pipe"] });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      void rm(partial, { force: true });
      finish({ error: new Error("silicon did not finish within 30 seconds.") });
    }, 30_000);

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      finish({ error: new Error(startErrorMessage(error)) });
    });
    child.on("close", (code) => {
      void (async () => {
        const size = await stat(partial)
          .then((info) => info.size)
          .catch(() => 0);
        if (code === 0 && size > 0) {
          try {
            await rename(partial, target);
          } catch (error) {
            await rm(partial, { force: true });
            finish({ error: new Error(`Cannot save ${target}: ${(error as Error).message}`) });
            return;
          }
          finish({ result: target });
          return;
        }
        await rm(partial, { force: true });
        finish({ error: new Error(siliconErrorMessage(stderr)) });
      })();
    });
    child.stdin.end(input.code);
  });
}
