import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { qrPng } from "~/utils/qr";

// A 0700 directory of its own, so the image is never written to a predictable shared path.
const dir = mkdtempSync(join(tmpdir(), "url-kit-"));
process.on("exit", () => rmSync(dir, { recursive: true, force: true }));

let counter = 0;

/**
 * Writes the QR code for `text` to a file and returns its path. Every call gets a
 * new name: the renderer keeps what it already drew for a path, so reusing one would
 * keep showing the previous code.
 */
export function writeQrImage(text: string): string {
  const path = join(dir, `qr-${counter++}.png`);
  writeFileSync(path, qrPng(text));
  return path;
}
