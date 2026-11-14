import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import type { Page } from "~/lib/places";

export type ClosedTab = {
  /** Milliseconds since the epoch, as the session store recorded it. */
  closedAt: number;
  title: string;
  url: string;
};

/**
 * Mozilla wraps its session JSON in `mozLz40\0`, a 4-byte magic, a 4-byte
 * little-endian uncompressed size, and one raw LZ4 block — not an LZ4 frame, so
 * the `lz4` CLI cannot read it.
 *
 * The block format is small enough to decode here: sequences of
 * `token [literal length] [literals] offset [match length]`, with 15 in a
 * length nibble meaning "add the following bytes until one is below 255".
 */
const MAGIC = "mozLz40\0";

export class MozLz4Error extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MozLz4Error";
  }
}

function readLength(block: Uint8Array, cursor: number, base: number): { length: number; cursor: number } {
  let length = base;
  if (base !== 15) return { length, cursor };

  for (;;) {
    const byte = block[cursor++];
    if (byte === undefined) throw new MozLz4Error("truncated length");
    length += byte;
    if (byte !== 255) return { length, cursor };
  }
}

/** Decompresses one LZ4 block into a buffer of exactly `size` bytes. */
export function decompressBlock(block: Uint8Array, size: number): Uint8Array {
  const output = new Uint8Array(size);
  let cursor = 0;
  let written = 0;

  while (cursor < block.length) {
    const token = block[cursor++]!;
    const literals = readLength(block, cursor, token >> 4);
    cursor = literals.cursor;
    if (written + literals.length > size) throw new MozLz4Error(`more than ${size} bytes of literals`);
    output.set(block.subarray(cursor, cursor + literals.length), written);
    written += literals.length;
    cursor += literals.length;

    // The last sequence of a block carries literals only.
    if (cursor >= block.length) break;

    const offset = block[cursor]! | (block[cursor + 1]! << 8);
    cursor += 2;
    if (offset === 0 || offset > written) throw new MozLz4Error(`match offset ${offset} before the start`);

    const match = readLength(block, cursor, token & 15);
    cursor = match.cursor;
    const length = match.length + 4;
    if (written + length > size) throw new MozLz4Error(`more than ${size} bytes of matches`);

    if (offset >= length) {
      // No overlap, so the match can be copied in one go instead of byte by byte.
      output.set(output.subarray(written - offset, written - offset + length), written);
      written += length;
    } else {
      for (let index = 0; index < length; index++) {
        output[written] = output[written - offset]!;
        written++;
      }
    }
  }

  if (written !== size) throw new MozLz4Error(`decoded ${written} bytes, header said ${size}`);
  return output;
}

/** Decodes a whole `mozLz4` file. */
export function decompressMozLz4(file: Uint8Array): string {
  if (file.length < 12) throw new MozLz4Error("shorter than the mozLz4 header");

  const magic = new TextDecoder().decode(file.subarray(0, 8));
  if (magic !== MAGIC) throw new MozLz4Error(`not a mozLz4 file: ${JSON.stringify(magic)}`);

  const size = new DataView(file.buffer, file.byteOffset + 8, 4).getUint32(0, true);
  return new TextDecoder().decode(decompressBlock(file.subarray(12), size));
}

type SessionEntry = { url?: string; title?: string };
type SessionTabState = { entries?: SessionEntry[]; index?: number };
type SessionTab = { closedAt?: number; title?: string; state?: SessionTabState };
type SessionWindow = { _closedTabs?: SessionTab[] };
type SessionData = { windows?: SessionWindow[] };

/**
 * The browser keeps closed tabs in the session store, not in a database:
 * `sessionstore-backups/recovery.jsonlz4` is rewritten every few seconds and
 * holds each window's `_closedTabs`.
 */
export function sessionFile(profile: string): string | null {
  const shapes = ["sessionstore-backups/recovery.jsonlz4", "sessionstore-backups/previous.jsonlz4"];

  let newest: { file: string; modified: number } | null = null;
  for (const shape of shapes) {
    const file = join(profile, shape);
    try {
      const modified = statSync(file).mtimeMs;
      if (newest === null || modified > newest.modified) newest = { file, modified };
    } catch {
      // A browser that was just closed may only have the backup; keep looking.
    }
  }

  return newest?.file ?? null;
}

/** The page a closed tab was showing: its selected entry, else the last one. */
export function closedTabsFrom(session: SessionData): ClosedTab[] {
  const tabs: ClosedTab[] = [];

  for (const window of session.windows ?? []) {
    for (const tab of window._closedTabs ?? []) {
      const entries = tab.state?.entries ?? [];
      const selected = entries[tab.state?.index ?? entries.length - 1] ?? entries[entries.length - 1];
      const url = selected?.url;
      if (!url) continue;

      tabs.push({
        closedAt: tab.closedAt ?? 0,
        title: tab.title || selected?.title || url,
        url,
      });
    }
  }

  return tabs.sort((a, b) => b.closedAt - a.closedAt);
}

export function readClosedTabs(profile: string): ClosedTab[] {
  const file = sessionFile(profile);
  if (file === null) return [];
  return closedTabsFrom(JSON.parse(decompressMozLz4(readFileSync(file))) as SessionData);
}

/** A page of closed tabs, newest first. The session keeps a bounded list. */
export function closedPage(profile: string, limit = 50, offset = 0): Page<ClosedTab> {
  const all = readClosedTabs(profile);
  const items = all.slice(offset, offset + limit);
  return { items, hasMore: offset + items.length < all.length };
}
