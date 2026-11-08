import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { accessSync, constants, existsSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { applyEvent, fromPython, initialState, takeLines } from "../utils/speedtest.ts";
import type { Backend, TestState } from "../utils/speedtest.ts";

export interface CliInfo {
	path: string;
	kind: Backend;
}

export type CliResolution = { cli: CliInfo } | { error: string };

export type RunOutcome = { ok: true; state: TestState } | { ok: false; error: string };

const TIMEOUT_MS = 120_000;

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
	return cli.kind === "python" ? runPython(cli, onState, signal) : runOokla(cli, onState, signal);
}

interface Attempt {
	code: number | null;
	stdout: string;
	stderr: string;
	cancelled: boolean;
	timedOut: boolean;
	spawnError: string;
}

/** One CLI process, collected to the end. The Python backend has no streaming
 * output, so it needs two of these to report each direction as it lands. */
function runOnce(file: string, args: string[], signal: AbortSignal): Promise<Attempt> {
	return new Promise<Attempt>((resolve) => {
		const child: ChildProcess = spawn(file, args, { stdio: ["ignore", "pipe", "pipe"] });

		let stdout = "";
		let stderr = "";
		let settled = false;
		let cancelled = false;
		let timedOut = false;
		let spawnError = "";

		const timer = setTimeout(() => {
			timedOut = true;
			try {
				child.kill("SIGKILL");
			} catch {
				// ignore
			}
		}, TIMEOUT_MS);

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

		const finish = (code: number | null) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			signal.removeEventListener("abort", onAbort);
			resolve({ code, stdout, stderr, cancelled, timedOut, spawnError });
		};

		child.stdout?.on("data", (chunk: Buffer | string) => {
			stdout += typeof chunk === "string" ? chunk : chunk.toString("utf8");
		});
		child.stderr?.on("data", (chunk: Buffer | string) => {
			stderr += typeof chunk === "string" ? chunk : chunk.toString("utf8");
		});

		child.on("error", (err: NodeJS.ErrnoException) => {
			spawnError =
				err?.code === "ENOENT"
					? "Speedtest CLI not found. Install Ookla's CLI from https://www.speedtest.net/apps/cli or speedtest-cli, then run it once."
					: err?.message ?? "Speedtest failed.";
			finish(null);
		});

		child.on("close", (code) => finish(code));
	});
}

function parseJson(text: string): unknown | null {
	const trimmed = text.trim();
	const lines = trimmed.split(/\n/).map((line) => line.trim()).filter((line) => line !== "");
	const candidate = lines.length > 0 ? lines[lines.length - 1] ?? trimmed : trimmed;
	try {
		return JSON.parse(candidate);
	} catch {
		try {
			return JSON.parse(trimmed);
		} catch {
			return null;
		}
	}
}

function attemptError(attempt: Attempt, direction: string): string {
	if (attempt.cancelled) return "Speedtest cancelled.";
	if (attempt.timedOut) return "Speedtest timed out after 120 seconds.";
	if (attempt.spawnError !== "") return attempt.spawnError;
	if (/license|gdpr|eula/i.test(attempt.stderr)) {
		return "Open a terminal and run speedtest once to review its terms, then try again.";
	}
	const lastLine = attempt.stderr
		.split(/\n/)
		.map((line) => line.trim())
		.filter((line) => line !== "")
		.pop();
	if (lastLine) return lastLine.slice(0, 500);
	return `Speedtest ${direction} test exited without a complete result.`;
}

async function runPython(
	cli: CliInfo,
	onState: (state: TestState) => void,
	signal: AbortSignal,
): Promise<RunOutcome> {
	const down = await runOnce(cli.path, ["--json", "--secure", "--no-upload"], signal);
	if (down.cancelled || down.timedOut || down.spawnError !== "" || down.code !== 0) {
		return { ok: false, error: attemptError(down, "download") };
	}
	const measured = fromPython(parseJson(down.stdout));
	if (measured.result === null) {
		return { ok: false, error: measured.error || attemptError(down, "download") };
	}
	if (signal.aborted) return { ok: false, error: "Speedtest cancelled." };

	// Download is measured and fixed; upload starts from scratch against the same
	// server, so its live figure is the only one that still has to roll.
	onState({ ...measured, phase: "upload", uploadMbps: 0, result: null });

	const args = ["--json", "--secure", "--no-download"];
	if (measured.server.id !== "") args.push("--server", measured.server.id);
	const up = await runOnce(cli.path, args, signal);
	if (up.cancelled || up.timedOut || up.spawnError !== "" || up.code !== 0) {
		return { ok: false, error: attemptError(up, "upload") };
	}
	const uploaded = fromPython(parseJson(up.stdout));
	if (uploaded.result === null) {
		return { ok: false, error: uploaded.error || attemptError(up, "upload") };
	}

	const result: TestState = {
		...measured,
		phase: "complete",
		uploadMbps: uploaded.uploadMbps,
		result: measured.result === null ? null : { ...measured.result, uploadMbps: uploaded.uploadMbps },
	};
	onState(result);
	return { ok: true, state: result };
}

async function runOokla(
	cli: CliInfo,
	onState: (state: TestState) => void,
	signal: AbortSignal,
): Promise<RunOutcome> {
	return new Promise<RunOutcome>((resolve) => {
		const args = ["--format=json", "--progress=yes", "--progress-update-interval=250"];
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
		}, TIMEOUT_MS);

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
			stdoutBuf += typeof chunk === "string" ? chunk : chunk.toString("utf8");
			const { lines, rest } = takeLines(stdoutBuf);
			stdoutBuf = rest;
			for (const line of lines) {
				const trimmed = line.trim();
				if (trimmed === "") continue;
				try {
					state = applyEvent(state, JSON.parse(trimmed));
					onState(state);
				} catch {
					// ignore malformed lines
				}
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
			const rest = stdoutBuf.trim();
			if (rest !== "") {
				try {
					state = applyEvent(state, JSON.parse(rest));
					onState(state);
				} catch {
					// ignore
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
					.map((line) => line.trim())
					.filter((line) => line !== "")
					.pop();
				if (state.error.trim() !== "") err = state.error;
				else if (lastLine) err = lastLine.slice(0, 500);
				else err = "Speedtest exited without a complete result.";
			}
			finish({ ok: false, error: err });
		});
	});
}
