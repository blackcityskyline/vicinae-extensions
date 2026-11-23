import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { codesOf } from "~/utils/scan";

const run = promisify(execFile);

/** `zbarimg` ran and found no barcode; every other non-zero status is a failure. */
const NO_SYMBOLS = 4;

type Failure = { code?: string | number; stderr?: string; message: string };

/**
 * The codes in an image file, read by `zbarimg`. An image can hold several, and
 * the reader wants them all; the same code found twice is one code.
 */
export async function readQrCodes(path: string): Promise<string[]> {
	try {
		const { stdout } = await run("zbarimg", ["-q", "--raw", path], { maxBuffer: 16 * 1024 * 1024 });
		return codesOf(stdout);
	} catch (failure) {
		const { code, stderr, message } = failure as Failure;
		if (code === "ENOENT") {
			throw new Error("zbarimg is not installed: install zbar (pacman -S zbar, apt install zbar-tools).");
		}
		if (code === NO_SYMBOLS) return [];
		const reason = (stderr ?? "").split("\n").map((line) => line.trim()).find(Boolean);
		throw new Error(reason || message);
	}
}
