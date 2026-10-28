import { closeSync, openSync, readSync } from "node:fs";

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Width and height from a PNG's IHDR chunk, which always follows the 8-byte
 * signature as a 4-byte length and the 4-byte type. Null for anything that is
 * not a PNG, or cannot be read.
 */
export const pngSize = (
	path: string,
): { width: number; height: number } | null => {
	const header = Buffer.alloc(24);
	let fd: number | undefined;
	try {
		fd = openSync(path, "r");
		if (readSync(fd, header, 0, header.length, 0) < header.length) return null;
	} catch {
		return null;
	} finally {
		if (fd !== undefined) closeSync(fd);
	}
	if (
		!header.subarray(0, 8).equals(SIGNATURE) ||
		header.toString("latin1", 12, 16) !== "IHDR"
	) {
		return null;
	}
	return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
};
