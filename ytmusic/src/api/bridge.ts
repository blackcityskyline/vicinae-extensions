import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

import type { Auth } from "~/api/auth";

/**
 * The Rust half does everything that talks to YouTube Music — the InnerTube calls and their
 * parsing both — so this file only starts it, hands it one JSON request and reads one JSON
 * answer. One process per call: the client is cheap to start and nothing outlives the answer.
 *
 * `cargo install` puts the binary in `~/.cargo/bin`, which a launcher started by the compositor
 * does not always have on its `PATH`, so the usual install spots are tried after the name.
 */
const CANDIDATES: readonly string[] = [
  process.env.YTMUSIC_BINARY ?? "ytmusic-cli",
  join(homedir(), ".cargo", "bin", "ytmusic-cli"),
  "/usr/local/bin/ytmusic-cli",
];

type Answer = { ok: true; data: unknown } | { ok: false; error: string };

export function call<T>(
  command: string,
  args: Record<string, unknown> = {},
  auth: Auth | null,
): Promise<T> {
  return attempt<T>(0, command, args, auth);
}

function attempt<T>(
  index: number,
  command: string,
  args: Record<string, unknown>,
  auth: Auth | null,
): Promise<T> {
  const binary = CANDIDATES[index] ?? CANDIDATES[0]!;
  return new Promise<T>((resolve, reject) => {
    const child = spawn(binary, [], {
      // the cookies are a secret and belong in the environment, not in argv
      env: auth
        ? {
            ...process.env,
            YTMUSIC_COOKIES: auth.cookies,
            YTMUSIC_AUTHUSER: String(auth.authUser),
          }
        : process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let answer = "";
    let trouble = "";
    child.stdout.on("data", (chunk: Buffer) => {
      answer += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      trouble += chunk.toString();
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      // a missing file is the one thing another install spot can fix
      if (error.code === "ENOENT" && index + 1 < CANDIDATES.length) {
        resolve(attempt<T>(index + 1, command, args, auth));
        return;
      }
      reject(
        new Error(
          `Cannot start ${binary}: ${error.message}. Install it from the ytmusic-cli repository with \`cargo install --path . --bin ytmusic-cli\`, or point YTMUSIC_BINARY at it.`,
        ),
      );
    });
    child.on("close", (code) => {
      const text = answer.trim();
      if (text === "") {
        reject(new Error(trouble.trim() || `${binary} answered nothing (exit ${code ?? "?"})`));
        return;
      }

      let parsed: Answer;
      try {
        parsed = JSON.parse(text) as Answer;
      } catch {
        reject(new Error(`${binary}: ${text.slice(0, 200)}`));
        return;
      }

      if (parsed.ok) resolve(parsed.data as T);
      else reject(new Error(parsed.error));
    });

    // the child may refuse the request and leave before reading it
    child.stdin.on("error", () => undefined);
    child.stdin.end(JSON.stringify({ command, args }));
  });
}
