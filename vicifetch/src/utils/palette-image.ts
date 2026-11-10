/**
 * The palette as a PNG: one row of flat squares. A metadata row is plain text,
 * so the only way to show colours there is an `<img>` in a rich-text label.
 * Written by hand: flat squares do not justify an image dependency, and zlib is
 * the only piece a PNG needs.
 */
import { deflateSync } from "node:zlib";

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

const rgb = (hex: string): [number, number, number] | undefined => {
	const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
	if (!match) return undefined;
	const value = Number.parseInt(match[1] ?? "", 16);
	return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
};

export const SWATCH = { cell: 20, gap: 4 } as const;

/** The strip size the markdown image must be told, in device pixels. */
export const swatchSize = (count: number) => ({
	width: count * SWATCH.cell + Math.max(0, count - 1) * SWATCH.gap,
	height: SWATCH.cell,
});

/** One row of squares with transparent gaps; an unreadable colour is skipped. */
export function swatchPng(colours: string[]): Buffer {
	const squares = colours
		.map(rgb)
		.filter((colour): colour is [number, number, number] => colour !== undefined);
	if (squares.length === 0) return Buffer.alloc(0);

	const { cell, gap } = SWATCH;
	const width = squares.length * cell + (squares.length - 1) * gap;
	const scanlines = Buffer.alloc(cell * (width * 4 + 1));

	for (let y = 0; y < cell; y += 1) {
		let offset = y * (width * 4 + 1) + 1;
		for (let x = 0; x < width; x += 1) {
			const index = Math.floor(x / (cell + gap));
			const colour = x - index * (cell + gap) < cell ? squares[index] : undefined;
			scanlines[offset] = colour ? colour[0] : 0;
			scanlines[offset + 1] = colour ? colour[1] : 0;
			scanlines[offset + 2] = colour ? colour[2] : 0;
			scanlines[offset + 3] = colour ? 255 : 0;
			offset += 4;
		}
	}

	const header = Buffer.alloc(13);
	header.writeUInt32BE(width, 0);
	header.writeUInt32BE(cell, 4);
	header[8] = 8; // bits per channel
	header[9] = 6; // truecolour with alpha
	header[10] = 0; // deflate
	header[11] = 0; // adaptive filtering
	header[12] = 0; // no interlacing

	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk("IHDR", header),
		chunk("IDAT", deflateSync(scanlines)),
		chunk("IEND", Buffer.alloc(0)),
	]);
}
