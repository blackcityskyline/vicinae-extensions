import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateSync } from "node:zlib";

import { QR_MAX_BYTES, qrPng } from "../src/utils/qr.ts";

/**
 * The QR encoder, against an independent decoder.
 *
 * A QR code that merely looks like one is the failure that cannot be seen by reading the
 * bytes, so every code is read back by the real `zbarimg`. When it is not installed the
 * decoding checks are skipped, not passed.
 */

let passed = 0;
let failed = 0;
let skipped = 0;

function check(name: string, body: () => string | void): void {
  try {
    const reason = body();
    if (reason) {
      skipped += 1;
      console.log(`SKIP ${name} — ${reason}`);
      return;
    }
    passed += 1;
    console.log(`ok   ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${name}`);
    console.log(`     ${(error as Error).message.split("\n").slice(0, 6).join("\n     ")}`);
  }
}

const dir = mkdtempSync(join(tmpdir(), "url-kit-qr-"));

function hasZbar(): boolean {
  try {
    execFileSync("zbarimg", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** What `zbarimg` reads out of the code, or null when it finds none. */
function decode(png: Buffer): string | null {
  const file = join(dir, `${Math.random().toString(36).slice(2)}.png`);
  writeFileSync(file, png);
  try {
    return execFileSync("zbarimg", ["--quiet", "--raw", file], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).replace(/\n$/, "");
  } catch (error) {
    if ((error as { status?: number }).status === 4) return null;
    throw error;
  }
}

/** Width, height and the decompressed grayscale rows of a PNG this encoder wrote. */
function readPng(png: Buffer): { width: number; height: number; rows: Buffer[] } {
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(png.toString("latin1", 12, 16), "IHDR");
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  assert.equal(png[24], 8, "not 8-bit");
  assert.equal(png[25], 0, "not grayscale");

  const idatAt = png.indexOf("IDAT", 33, "latin1");
  const idatLength = png.readUInt32BE(idatAt - 4);
  const raw = inflateSync(png.subarray(idatAt + 4, idatAt + 4 + idatLength));
  assert.equal(raw.length, (width + 1) * height);
  const rows: Buffer[] = [];
  for (let y = 0; y < height; y++) {
    assert.equal(raw[y * (width + 1)], 0, "unexpected scanline filter");
    rows.push(raw.subarray(y * (width + 1) + 1, (y + 1) * (width + 1)));
  }
  return { width, height, rows };
}

check("the image is a square grayscale PNG with a white quiet zone", () => {
  const { width, height, rows } = readPng(qrPng("https://example.com"));
  assert.equal(width, height);
  assert.equal(width % 10, 0, "modules are not a whole number of pixels");
  // Four modules of white on every side, so a scanner can find the edges.
  const quiet = 4 * 10;
  for (let y = 0; y < quiet; y++) assert.ok(rows[y]!.every((p) => p === 0xff), `row ${y} is not white`);
  for (let y = height - quiet; y < height; y++) assert.ok(rows[y]!.every((p) => p === 0xff));
  for (const row of rows) {
    assert.ok(row.subarray(0, quiet).every((p) => p === 0xff) && row.subarray(width - quiet).every((p) => p === 0xff));
  }
  const dark = rows.reduce((sum, row) => sum + row.filter((p) => p === 0).length, 0);
  assert.ok(dark > 0, "an all-white image is not a code");
});

check("a link is read back exactly", () => {
  if (!hasZbar()) return "zbarimg is not installed";
  const link = "https://example.com/a/b?q=one+two&r=%D0%BF#frag";
  assert.equal(decode(qrPng(link)), link);
});

check("text that is not ASCII survives", () => {
  if (!hasZbar()) return "zbarimg is not installed";
  assert.equal(decode(qrPng("привет, мир — 你好")), "привет, мир — 你好");
});

check("a long text is read back, up to the stated capacity", () => {
  if (!hasZbar()) return "zbarimg is not installed";
  const long = "abcdefghij".repeat(100);
  assert.equal(decode(qrPng(long)), long);
});

check("text past the capacity is refused with a message, not a crash or a wrong code", () => {
  assert.throws(() => qrPng("x".repeat(QR_MAX_BYTES + 1)), /Too much text for a QR code/);
});

rmSync(dir, { recursive: true, force: true });

console.log(failed === 0 ? `\n${passed} passed, ${skipped} skipped` : `\n${failed} check(s) failed`);
process.exit(failed === 0 ? 0 : 1);
