import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { detectPackageManager, ocrLanguageInstallCommand } from "./tools-database";

const exec = promisify(execFile);
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;

/** `zbarimg`'s exit status for "ran fine, found no barcode". Every other non-zero status is a failure. */
const ZBAR_NO_SYMBOLS = 4;

/** A scan that failed for a reason the user can act on. */
export class ScanError extends Error {
	constructor(
		message: string,
		/** A shell command that fixes it, when there is one. */
		readonly installCommand: string | null = null,
	) {
		super(message);
		this.name = "ScanError";
	}
}

// For a promisified execFile, `code` is the exit status when the process ran
// and a string such as "ENOENT" when it never started.
type ExecFailure = { code?: string | number; stderr?: string; message: string };

const notInstalled = (tool: string): ScanError =>
	new ScanError(
		`${tool} is not installed or not on PATH. Open Manage Tools to see how to install it.`,
	);

/** The line that says what went wrong: the first mentioning an error, else the first. */
const reasonIn = (stderr: string): string => {
	const lines = stderr.split("\n").map((l) => l.trim()).filter(Boolean);
	return lines.find((l) => /error/i.test(l)) ?? lines[0] ?? "";
};

/**
 * Text in `imagePath`, in the Tesseract language `language`. Empty when the
 * image holds none: Tesseract exits 0 with no output in that case.
 */
export const runOcr = async (
	imagePath: string,
	language: string,
): Promise<string> => {
	try {
		const { stdout } = await exec(
			"tesseract",
			[imagePath, "stdout", "-l", language],
			{ maxBuffer: MAX_OUTPUT_BYTES },
		);
		return stdout.trim();
	} catch (e) {
		const failure = e as ExecFailure;
		if (failure.code === "ENOENT") throw notInstalled("tesseract");
		const stderr = failure.stderr ?? "";
		if (/Error opening data file|Failed loading language/.test(stderr)) {
			const pm = detectPackageManager();
			throw new ScanError(
				`Tesseract has no data for the language "${language}".`,
				pm === "unknown" ? null : ocrLanguageInstallCommand(language, pm),
			);
		}
		throw new ScanError(
			`tesseract failed: ${reasonIn(stderr) || failure.message}`,
		);
	}
};

/** The decoded text of every barcode in `imagePath`, one per line. Empty when there is none. */
export const runQrScan = async (imagePath: string): Promise<string> => {
	try {
		const { stdout } = await exec(
			"zbarimg",
			["--quiet", "--raw", imagePath],
			{ maxBuffer: MAX_OUTPUT_BYTES },
		);
		return stdout.trim();
	} catch (e) {
		const failure = e as ExecFailure;
		if (failure.code === "ENOENT") throw notInstalled("zbarimg");
		if (failure.code === ZBAR_NO_SYMBOLS) return "";
		throw new ScanError(
			`zbarimg failed: ${reasonIn(failure.stderr ?? "") || failure.message}`,
		);
	}
};
