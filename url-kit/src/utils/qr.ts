import { deflateSync } from "node:zlib";
import qrcode from "qrcode-generator";

// Byte mode defaults to ISO-8859-1, which would turn "привет" into question marks.
qrcode.stringToBytes = qrcode.stringToBytesFuncs["UTF-8"]!;

/** Modules of white around the code. ISO 18004 asks for four; scanners rely on it. */
const QUIET_ZONE = 4;
/** Pixels per module. Large enough that a phone camera focuses on a window. */
const MODULE_PIXELS = 10;

/** What the QR code holds at the error-correction level used here (level M, byte mode). */
export const QR_MAX_BYTES = 2331;

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Buffer): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}

/** An 8-bit grayscale PNG. `rows` holds one byte per pixel, `width` bytes per row. */
function grayscalePng(width: number, height: number, rows: Buffer): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 0; // grayscale

  // Each scanline starts with its filter type; 0 is "none".
  const scanlines = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y++) {
    rows.copy(scanlines, y * (width + 1) + 1, y * width, (y + 1) * width);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(scanlines)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * A QR code for `text` as PNG bytes: black modules on white, with the quiet zone.
 * Throws a message for the user when the text does not fit.
 */
export function qrPng(text: string): Buffer {
  const code = qrcode(0, "M");
  try {
    code.addData(text);
    code.make();
  } catch {
    // The library throws a bare value on overflow, with nothing to show.
    throw new Error(`Too much text for a QR code: at most ${QR_MAX_BYTES} bytes fit.`);
  }

  const modules = code.getModuleCount();
  const side = (modules + 2 * QUIET_ZONE) * MODULE_PIXELS;
  const pixels = Buffer.alloc(side * side, 0xff);

  for (let row = 0; row < modules; row++) {
    for (let col = 0; col < modules; col++) {
      if (!code.isDark(row, col)) continue;
      const top = (row + QUIET_ZONE) * MODULE_PIXELS;
      const left = (col + QUIET_ZONE) * MODULE_PIXELS;
      for (let y = top; y < top + MODULE_PIXELS; y++) {
        pixels.fill(0, y * side + left, y * side + left + MODULE_PIXELS);
      }
    }
  }

  return grayscalePng(side, side, pixels);
}
