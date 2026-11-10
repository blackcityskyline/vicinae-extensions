import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { inflateSync } from "node:zlib";
import { palettePng, writePaletteImage } from "../src/lib/palette-image.ts";

/**
 * The palette image is assembled byte by byte, so the check reads it back the
 * way a decoder would: signature, header, then the pixels behind the deflate
 * stream. A wrong chunk length or CRC shows up as an image that never draws.
 */

let passed = 0;
let failed = 0;

function check(name: string, body: () => void): void {
	try {
		body();
		passed += 1;
		console.log(`ok   ${name}`);
	} catch (error) {
		failed += 1;
		console.log(`FAIL ${name}`);
		const message = error instanceof Error ? error.message : String(error);
		console.log(`     ${message.split("\n").slice(0, 8).join("\n     ")}`);
	}
}

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
	let value = index;
	for (let bit = 0; bit < 8; bit += 1) {
		value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
	}
	return value >>> 0;
});

const crc32 = (buffer: Buffer): number => {
	let crc = 0xffffffff;
	for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
	return (crc ^ 0xffffffff) >>> 0;
};

/** Walks the chunks so a bad CRC is caught where a decoder would reject it. */
const chunks = (png: Buffer): Map<string, Buffer> => {
	const found = new Map<string, Buffer>();
	let offset = 8;
	while (offset < png.length) {
		const length = png.readUInt32BE(offset);
		const type = png.toString("ascii", offset + 4, offset + 8);
		const data = png.subarray(offset + 8, offset + 8 + length);
		const crc = png.readUInt32BE(offset + 8 + length);
		assert.equal(crc, crc32(png.subarray(offset + 4, offset + 8 + length)), `${type} crc`);
		found.set(type, data);
		offset += 12 + length;
	}
	return found;
};

check("a 3x3 palette is a PNG of nine squares", () => {
	const colours = [
		"#EAF2FB",
		"#C0D9F2",
		"#96BFE9",
		"#6CA6E0",
		"#2D7FD2",
		"#2466A8",
		"#1B4C7E",
		"#123354",
		"#09192A",
	];
	const png = palettePng(colours, 3, 10, 10);

	assert.deepEqual(
		[...png.subarray(0, 8)],
		[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
		"signature",
	);

	const parts = chunks(png);
	const header = parts.get("IHDR")!;
	assert.equal(header.readUInt32BE(0), 30, "width");
	assert.equal(header.readUInt32BE(4), 30, "height");
	assert.equal(header[8], 8, "bit depth");
	assert.equal(header[9], 2, "truecolour");

	const pixels = inflateSync(parts.get("IDAT")!);
	const pixel = (x: number, y: number): number[] => {
		const start = y * (30 * 3 + 1) + 1 + x * 3;
		return [pixels[start]!, pixels[start + 1]!, pixels[start + 2]!];
	};
	assert.deepEqual(pixel(0, 0), [0xea, 0xf2, 0xfb], "top left is the first colour");
	assert.deepEqual(pixel(29, 0), [0x96, 0xbf, 0xe9], "top right ends the first row");
	assert.deepEqual(pixel(15, 15), [0x2d, 0x7f, 0xd2], "middle square");
	assert.deepEqual(pixel(29, 29), [0x09, 0x19, 0x2a], "bottom right is the last colour");
	assert.equal(parts.has("IEND"), true);
});

check("a partial last row repeats the last colour instead of running off", () => {
	const png = palettePng(["#FF0000", "#00FF00"], 3, 4, 4);
	const header = chunks(png).get("IHDR")!;
	assert.equal(header.readUInt32BE(0), 12);
	assert.equal(header.readUInt32BE(4), 4);
	const pixels = inflateSync(chunks(png).get("IDAT")!);
	// Third cell of the only row: there is no third colour, so the second fills it.
	const start = 1 + 8 * 3;
	assert.deepEqual([pixels[start], pixels[start + 1], pixels[start + 2]], [0, 255, 0]);
});

check("the image name carries the colour and the harmony", () => {
	const directory = mkdtempSync(join(tmpdir(), "iskra-palette-"));
	try {
		writeFileSync(join(directory, "palette-OLD-shades.png"), "stale");
		const path = writePaletteImage(directory, "#3b82f6", "triadic", ["#000000"]);
		// The launcher caches by path, so a stale name would show the old grid.
		assert.equal(basename(path), "palette-3B82F6-triadic.png");
		assert.deepEqual(readdirSync(directory), ["palette-3B82F6-triadic.png"]);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
