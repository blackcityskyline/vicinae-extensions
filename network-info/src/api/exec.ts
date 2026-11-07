import { execFile } from "node:child_process";

export type RunResult =
	| { ok: true; stdout: string }
	| { ok: false; missing: boolean; error: string };

export function run(command: string, args: string[], timeoutMs: number): Promise<RunResult> {
	return new Promise((resolve) => {
		execFile(
			command,
			args,
			{ timeout: timeoutMs, maxBuffer: 1024 * 1024, encoding: "utf8" },
			(error, stdout, stderr) => {
				if (!error) {
					resolve({ ok: true, stdout });
					return;
				}
				const missing = (error as NodeJS.ErrnoException).code === "ENOENT";
				resolve({
					ok: false,
					missing,
					error: missing ? `${command} is not installed` : (stderr || error.message).trim(),
				});
			},
		);
	});
}