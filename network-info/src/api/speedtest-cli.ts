import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { accessSync, constants, existsSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
	applyEvent,
	fromPython,
	initialState,
	takeLines,
} from "../utils/speedtest.ts";
import type { Backend, TestState } from "../utils/speedtest.ts";

export interface CliInfo {
	path: string;
	kind: Backend;
}

export type CliResolution = { cli: CliInfo } | { error: string };

export type RunOutcome = { ok: true; state: TestState } | { ok: false; error: string };


export function findExecutable(name: string, envPath: string, home: string): string | null {
	let target = name;
	if (target.startsWith("~/")) {
		target = path.join(home, target.slice(2));
	}

	if (target.includes("/")) {
		try {
			if (existsSync(target) && accessSync(target, constants.X_OK) === undefined) {
				return target;
			}
		} catch {
			return null;
		}
		return null;
	}

	for (const dir of envPath.split(":")) {
		if (dir === "") continue;
		const candidate = path.join(dir, target);
		try {
			if (existsSync(candidate)) {
				accessSync(candidate, constants.X_OK);
				return candidate;
			}
		} catch {
			// not executable or missing
		}
	}

	if (target === "speedtest") {
		const candidate = path.join(home, ".local", "bin", "speedtest");
		try {
			if (existsSync(candidate)) {
				accessSync(candidate, constants.X_OK);
				return candidate;
			}
		} catch {
			// not executable
		}
	}

	return null;
}

export function classifyCli(version: string, help: string): Backend | null {
	const v = version.toLowerCase();
	const h = help.toLowerCase();
	if (v.includes("ookla") || h.includes("ookla") || h.includes("--progress-update-interval")) {
		return "ookla";
	}
	if (v.includes("speedtest-cli") || h.includes("speedtest-cli") || (h.includes("--json") && h.includes("--secure"))) {
		return "python";
	}
	return null;
}

const execFileAsync = promisify(execFile);

export async function resolveCli(configured: string): Promise<CliResolution> {
	const name = configured.trim() === "" ? "speedtest" : configured.trim();
	const found = findExecutable(name, process.env.PATH ?? "", os.homedir());
	if (found === null) {
		return { error: "Speedtest CLI not found. Install Ookla's CLI from https://www.speedtest.net/apps/cli or speedtest-cli, then run it once." };
	}

	let versionOut = "";
	let helpOut = "";
	try {
		const result = await execFileAsync(found, ["--version"], {
			timeout: 3000,
			maxBuffer: 1024 * 1024,
			encoding: "utf8",
		});
		versionOut = `${result.stdout ?? ""}${result.stderr ?? ""}`;
	} catch (error: any) {
		versionOut = `${error?.stdout ?? ""}${error?.stderr ?? ""}`;
	}
	try {
		const result = await execFileAsync(found, ["--help"], {
			timeout: 3000,
			maxBuffer: 1024 * 1024,
			encoding: "utf8",
		});
		helpOut = `${result.stdout ?? ""}${result.stderr ?? ""}`;
	} catch (error: any) {
		helpOut = `${error?.stdout ?? ""}${error?.stderr ?? ""}`;
	}

	const kind = classifyCli(versionOut, helpOut);
	if (kind === null) {
		return { error: "This is not a supported Speedtest CLI. Use Ookla Speedtest 1.2.0+ or speedtest-cli." };
	}
	return { cli: { path: found, kind } };
}

export async function runSpeedtest(
	cli: CliInfo,
	onState: (state: TestState) => void,
	signal: AbortSignal,
): Promise<RunOutcome> {
	return new Promise<RunOutcome>((resolve) => {
		const args =
			cli.kind === "ookla"
				? ["--format=json", "--progress=yes", "--progress-update-interval=250"]
				: ["--json", "--secure"];

		const child: ChildProcess = spawn(cli.path, args, { stdio: ["ignore", "pipe", "pipe"] });

		let stdoutBuf = "";
		let stderrBuf = "";
		let state = initialState();
		let finished = false;
		let timedOut = false;
		let cancelled = false;

		const timer = setTimeout(() => {
			timedOut = true;
			try {
				child.kill("SIGKILL");
			} catch {
				// ignore
			}
		}, 120_000);

		const onAbort = () => {
			cancelled = true;
			try {
				child.kill("SIGKILL");
			} catch {
				// ignore
			}
		};
		if (signal.aborted) onAbort();
		else signal.addEventListener("abort", onAbort, { once: true });

		const cleanup = () => {
			clearTimeout(timer);
			signal.removeEventListener("abort", onAbort);
		};

		const finish = (outcome: RunOutcome) => {
			if (finished) return;
			finished = true;
			cleanup();
			resolve(outcome);
		};

		child.stdout?.on("data", (chunk: Buffer | string) => {
			const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
			if (cli.kind === "ookla") {
				stdoutBuf += text;
				const { lines, rest } = takeLines(stdoutBuf);
				stdoutBuf = rest;
				for (const line of lines) {
					const trimmed = line.trim();
					if (trimmed === "") continue;
					try {
						const event = JSON.parse(trimmed);
						state = applyEvent(state, event);
						onState(state);
					} catch {
						// ignore malformed lines
					}
				}
			} else {
				stdoutBuf += text;
			}
		});

		child.stderr?.on("data", (chunk: Buffer | string) => {
			stderrBuf += typeof chunk === "string" ? chunk : chunk.toString("utf8");
		});

		child.on("error", (err: NodeJS.ErrnoException) => {
			cleanup();
			if (err?.code === "ENOENT") {
				finish({
					ok: false,
					error: "Speedtest CLI not found. Install Ookla's CLI from https://www.speedtest.net/apps/cli or speedtest-cli, then run it once.",
				});
			} else {
				finish({ ok: false, error: err?.message ?? "Speedtest failed." });
			}
		});

		child.on("close", (code) => {
			if (cli.kind === "ookla") {
				const rest = stdoutBuf.trim();
				if (rest !== "") {
					try {
						const event = JSON.parse(rest);
						state = applyEvent(state, event);
						onState(state);
					} catch {
						// ignore
					}
				}
				stdoutBuf = "";
			} else {
				const trimmed = stdoutBuf.trim();
				const lines = trimmed.split(/\n/).map((l) => l.trim()).filter((l) => l !== "");
				let jsonText = trimmed;
				if (lines.length > 0) jsonText = lines[lines.length - 1] ?? trimmed;
				let parsed: unknown = null;
				try {
					parsed = JSON.parse(jsonText);
				} catch {
					try {
						parsed = JSON.parse(trimmed);
					} catch {
						parsed = null;
					}
				}
				if (parsed !== null) {
					state = fromPython(parsed);
					onState(state);
				}
			}

			if (cancelled) {
				finish({ ok: false, error: "Speedtest cancelled." });
				return;
			}
			if (timedOut) {
				finish({ ok: false, error: "Speedtest timed out after 120 seconds." });
				return;
			}

			if (code === 0 && state.result !== null) {
				finish({ ok: true, state });
				return;
			}

			let err: string;
			if (/license|gdpr|eula/i.test(stderrBuf)) {
				err = "Open a terminal and run speedtest once to review its terms, then try again.";
			} else {
				const lastLine = stderrBuf
					.split(/\n/)
					.map((l) => l.trim())
					.filter((l) => l !== "")
					.pop();
				if (state.error.trim() !== "") err = state.error;
				else if (lastLine) err = lastLine.slice(0, 500);
				else err = "Speedtest exited without a complete result.";
			}
			finish({ ok: false, error: err });
		});
	});
}
