/**
 * A palette as a PNG, so the launcher can show colours instead of repeating
 * their codes. Written by hand: nine squares of flat colour do not justify an
 * image dependency, and zlib from node is the only piece a PNG really needs.
 */
import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { hexToRgb } from "./color";

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

const chunk = (type: string, data: Buffer): Buffer => {
	const length = Buffer.alloc(4);
	length.writeUInt32BE(data.length, 0);
	const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(body), 0);
	return Buffer.concat([length, body, crc]);
};

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Flat cells, `columns` per row, wrapping down; unknown colours come out black. */
export const palettePng = (colours: string[], columns = 5, cellWidth = 70, cellHeight = 100): Buffer => {
	const rows = Math.ceil(colours.length / columns);
	const width = columns * cellWidth;
	const height = rows * cellHeight;
	const pixels = colours.map((hex) => hexToRgb(hex) ?? { r: 0, g: 0, b: 0 });

	const scanlines = Buffer.alloc(height * (width * 3 + 1));
	let offset = 0;
	for (let y = 0; y < height; y += 1) {
		scanlines[offset] = 0; // filter: none
		offset += 1;
		for (let x = 0; x < width; x += 1) {
			const index = Math.min(
				Math.floor(y / cellHeight) * columns + Math.floor(x / cellWidth),
				pixels.length - 1,
			);
			const pixel = pixels[index] ?? { r: 0, g: 0, b: 0 };
			scanlines[offset] = pixel.r;
			scanlines[offset + 1] = pixel.g;
			scanlines[offset + 2] = pixel.b;
			offset += 3;
		}
	}

	const header = Buffer.alloc(13);
	header.writeUInt32BE(width, 0);
	header.writeUInt32BE(height, 4);
	header[8] = 8; // bits per channel
	header[9] = 2; // truecolour RGB
	header[10] = 0; // deflate
	header[11] = 0; // adaptive filtering
	header[12] = 0; // no interlacing

	return Buffer.concat([
		PNG_SIGNATURE,
		chunk("IHDR", header),
		chunk("IDAT", deflateSync(scanlines)),
		chunk("IEND", Buffer.alloc(0)),
	]);
};

/**
 * Writes the palette image and returns its path. The name carries the colour
 * and the harmony because the launcher caches images by path; the previous
 * palette is removed so the support directory holds exactly one.
 */
export const writePaletteImage = (
	directory: string,
	hex: string,
	harmony: string,
	colours: string[],
): string => {
	const name = `palette-${hex.replace("#", "").toUpperCase()}-${harmony}.png`;
	mkdirSync(directory, { recursive: true });
	for (const file of readdirSync(directory)) {
		if (file.startsWith("palette") && file !== name) unlinkSync(join(directory, file));
	}
	const path = join(directory, name);
	// Five square cells per row fill the side panel at its width.
	writeFileSync(path, palettePng(colours, 5, 90, 90));
	return path;
};
