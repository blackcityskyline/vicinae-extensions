import { useEffect, useState } from "react";

import { artworkFor, type Artwork } from "~/utils/artwork";
import { themeInk } from "~/lib/theme";

/**
 * The detail pane's picture: the cover in a card, framed by a blown-up copy of
 * itself.
 *
 * A markdown image is capped by `MdImage.qml` at `min(200, 0.7 × markdown
 * height)`, so the card is drawn at 420×200 and the pane shrinks it without
 * changing its shape. The cover inside keeps its own shape too: YouTube serves
 * 16:9 video thumbnails and square channel pictures, and stretching either is
 * worse than a narrower card. The shape comes from the bytes, never assumed.
 */
export const CARD_W = 420;
export const CARD_H = 200;

/**
 * The card under the cover: the title, the line under it and the facts. A
 * `metadata` bar would take the height the two cards need and leave a gap
 * between them, so the pane is cards top to bottom.
 */
const COVER_H = 180;
const INFO_H = 180;

/** Inset of the framed cover from the card edge. */
const PAD = 18;
const RADIUS = 14;
const ART_RADIUS = 8;
const INFO_PAD = 20;
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

/**
 * The card ink. A card has no plate, so the pane's own background shows through
 * and the text has to be the launcher's colour: `configureInk` reads it once
 * when the command starts, and this is the fallback.
 */
let ink = "#e6e7ea";

export function configureInk(appearance: "light" | "dark"): void {
  ink = themeInk(appearance);
}

export type Size = { width: number; height: number };
export type Row = [label: string, value: string];

/** A pane: the picture, what it is, the facts under it, and any free text. */
export type Pane = {
  cover?: string;
  /** Some uploads have no 1280×720 frame; this is the 4:3 one YouTube keeps. */
  coverFallback?: string;
  title: string;
  subtitle?: string;
  rows: Row[];
  /** The description the row carries, drawn at the foot of the facts card. */
  description?: string;
  /** A word about the row itself, e.g. that this extension played it. */
  badge?: string;
};

function useArtwork(url: string | undefined, fallback?: string): Artwork {
  const [art, setArt] = useState<Artwork>({ href: "" });

  useEffect(() => {
    let active = true;
    setArt({ href: "" });
    void artworkFor(url, fallback).then((found) => {
      if (active) setArt(found);
    });
    return () => {
      active = false;
    };
  }, [url, fallback]);

  return art;
}

/**
 * The pane's markdown: the cover, then the facts card with its free text.
 * Written before the picture arrives so the pane keeps its shape.
 */
export function paneMarkdown(pane: Pane, art: Artwork): string {
  return [
    cardToMarkdown(coverCard(art.href, art.size, COVER_H, pane.badge), COVER_H),
    cardToMarkdown(infoCard(pane.title, pane.subtitle, pane.rows, pane.description), INFO_H),
  ].join("\n\n");
}

export function usePane(pane: Pane): string {
  return paneMarkdown(pane, useArtwork(pane.cover, pane.coverFallback));
}

/**
 * The intrinsic size of JPEG, PNG, GIF or WebP bytes, which is the largest size
 * YouTube Music serves. Anything else answers `undefined` and the card falls
 * back to a plain background rather than a guessed shape.
 */
export function imageSize(bytes: Uint8Array): Size | undefined {
  const be16 = (at: number) => (bytes[at]! << 8) | bytes[at + 1]!;
  const be32 = (at: number) =>
    ((bytes[at]! << 24) | (bytes[at + 1]! << 16) | (bytes[at + 2]! << 8) | bytes[at + 3]!) >>> 0;

  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { width: be32(16), height: be32(20) };
  }

  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return { width: bytes[6]! | (bytes[7]! << 8), height: bytes[8]! | (bytes[9]! << 8) };
  }

  // JPEG carries its size in the first frame header: walk the markers to it.
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let at = 2;
    while (at + 9 < bytes.length) {
      if (bytes[at] !== 0xff) {
        at++;
        continue;
      }
      const marker = bytes[at + 1]!;
      const length = be16(at + 2);
      const isFrame =
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf);
      if (isFrame) return { height: be16(at + 5), width: be16(at + 7) };
      if (length < 2) return undefined;
      at += 2 + length;
    }
    return undefined;
  }

  // RIFF/WebP: VP8X stores 24-bit sizes, the lossy VP8 a 14-bit pair, VP8L a
  // packed 14-bit pair.
  if (bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    const chunk = String.fromCharCode(bytes[12]!, bytes[13]!, bytes[14]!, bytes[15]!);
    if (chunk === "VP8X") {
      const w = (bytes[24]! | (bytes[25]! << 8) | (bytes[26]! << 16)) + 1;
      const h = (bytes[27]! | (bytes[28]! << 8) | (bytes[29]! << 16)) + 1;
      return { width: w, height: h };
    }
    if (chunk === "VP8 ") {
      // The lossy keyframe header stores both sizes little-endian, unlike the
      // 24-bit VP8X pair below. YouTube serves `hq720.jpg` as this WebP.
      const le16 = (at: number) => bytes[at]! | (bytes[at + 1]! << 8);
      return { width: le16(26) & 0x3fff, height: le16(28) & 0x3fff };
    }
    if (chunk === "VP8L") {
      const bits = (bytes[21]! | (bytes[22]! << 8) | (bytes[23]! << 16) | (bytes[24]! << 24)) >>> 0;
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    return undefined;
  }

  return undefined;
}

const round = (value: number) => (Math.round(value * 10) / 10).toString();

/** The text goes inside the SVG, so a title with `&` or `<` must not break it. */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const DESCRIPTION_CHARS = 66;
const DESCRIPTION_LINES = 2;
const BLURB_CHARS = 56;
const BLURB_LINES = 3;

/** One line, cut with an ellipsis: a card has no room to wrap. */
function cut(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/**
 * Free text in the card: whole words per line, as many lines as fit, the last
 * one cut. A card cannot scroll, so the rest is the "More" the row's own page
 * is for.
 */
function wrap(text: string, chars: number = DESCRIPTION_CHARS, maxLines: number = DESCRIPTION_LINES): string[] {
  const flat = text.replace(/\s+/g, " ").trim();
  const lines: string[] = [];
  let rest = flat;

  while (rest !== "" && lines.length < maxLines) {
    if (rest.length <= chars) {
      lines.push(rest);
      rest = "";
      break;
    }

    const space = rest.lastIndexOf(" ", chars);
    const end = space > 0 ? space : chars;
    lines.push(rest.slice(0, end));
    rest = rest.slice(end).trimStart();
  }

  if (rest !== "") {
    const last = lines.length - 1;
    lines[last] = cut(`${lines[last]} ${rest}`, chars);
  }

  return lines;
}

/** Rasterised at 2×: the pane scales the card to its box and 1× text comes out soft. */
const SCALE = 2;
const svg = (height: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W * SCALE}" height="${height * SCALE}" viewBox="0 0 ${CARD_W} ${height}">${body}</svg>`;

/**
 * The card. Behind the cover sits the same picture scaled to cover the whole
 * card and dimmed — the usual "blurred album background" without the blur, which
 * the SVG module does not render — so a square cover is framed rather than
 * marooned on a flat rectangle.
 */
export function coverCard(href: string, size: Size | undefined, height: number = CARD_H, badge?: string): string {
  const veil =
    `<linearGradient id="veil" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0%" stop-color="#0b0d10" stop-opacity="0.55"/>` +
    `<stop offset="100%" stop-color="#0b0d10" stop-opacity="0.9"/>` +
    `</linearGradient>`;

  let body = `<defs><clipPath id="card"><rect width="${CARD_W}" height="${height}" rx="${RADIUS}"/></clipPath>${veil}</defs>`;
  body += `<g clip-path="url(#card)">`;

  if (href && size && size.width > 0 && size.height > 0) {
    const fill = Math.max(CARD_W / size.width, height / size.height);
    const backW = size.width * fill;
    const backH = size.height * fill;
    body +=
      `<image x="${round((CARD_W - backW) / 2)}" y="${round((height - backH) / 2)}" ` +
      `width="${round(backW)}" height="${round(backH)}" opacity="0.5" href="${href}"/>` +
      `<rect width="${CARD_W}" height="${height}" fill="url(#veil)"/>`;

    const boxW = CARD_W - PAD * 2;
    const boxH = height - PAD * 2;
    const fit = Math.min(boxW / size.width, boxH / size.height);
    const artW = size.width * fit;
    const artH = size.height * fit;
    const x = (CARD_W - artW) / 2;
    const y = (height - artH) / 2;
    body +=
      `<image x="${round(x)}" y="${round(y)}" width="${round(artW)}" height="${round(artH)}" href="${href}"/>` +
      `<rect x="${round(x)}" y="${round(y)}" width="${round(artW)}" height="${round(artH)}" ` +
      `rx="${ART_RADIUS}" fill="none" stroke="#ffffff" stroke-opacity="0.16"/>`;
  }

  body += `</g>`;
  if (badge !== undefined && badge !== "") body += badgePlate(badge);
  return svg(height, body);
}

/**
 * A word about the row, on a plate over the cover's corner. The row itself stays
 * a title: a list of videos with a tag on some lines reads as a table.
 */
function badgePlate(text: string): string {
  const label = cut(text.toUpperCase(), 24);
  const width = label.length * 7.4 + 20;
  const x = CARD_W - PAD - width;
  const y = PAD;
  return (
    `<rect x="${round(x)}" y="${round(y)}" width="${round(width)}" height="22" rx="11" ` +
    `fill="#0b0d10" fill-opacity="0.78" stroke="#ffffff" stroke-opacity="0.2"/>` +
    `<text x="${round(x + width / 2)}" y="${round(y + 15)}" font-family="${FONT}" font-size="10" ` +
    `font-weight="700" letter-spacing="1" fill="#ffffff" text-anchor="middle">${escapeXml(label)}</text>`
  );
}

/**
 * The card under the cover: title, artist, and the facts as label/value rows.
 * Drawn rather than put in a `metadata` bar, which would take the height the
 * cards need and leave a gap between the cover and itself.
 */
export function infoCard(
  title: string,
  subtitle: string | undefined,
  rows: Row[],
  description?: string,
): string {
  let body =
    `<text x="${INFO_PAD}" y="44" font-family="${FONT}" font-size="21" font-weight="700" ` +
    `fill="${ink}">${escapeXml(cut(title, 32))}</text>`;

  if (subtitle) {
    body +=
      `<text x="${INFO_PAD}" y="66" font-family="${FONT}" font-size="13" fill="${ink}" ` +
      `opacity="0.62">${escapeXml(cut(subtitle, 54))}</text>`;
  }

  const top = 84;
  body +=
    `<rect x="${INFO_PAD}" y="${top}" width="${CARD_W - INFO_PAD * 2}" height="1" ` +
    `fill="${ink}" opacity="0.14"/>`;

  // Free text sits at the foot of the card, so the rows share what is above it.
  const lines = description ? wrap(description) : [];
  const textBaseline = INFO_H - 16 - (lines.length - 1) * 14;
  const bottom = lines.length > 0 ? textBaseline - 10 : INFO_H - 6;

  const step = (bottom - top) / Math.max(rows.length, 1);
  rows.forEach(([label, value], index) => {
    const centre = top + step * (index + 0.5);
    body +=
      `<text x="${INFO_PAD}" y="${round(centre + 4)}" font-family="${FONT}" font-size="10" ` +
      `font-weight="700" letter-spacing="1.3" fill="${ink}" opacity="0.5">${escapeXml(label.toUpperCase())}</text>` +
      `<text x="${CARD_W - INFO_PAD}" y="${round(centre + 5)}" font-family="${FONT}" font-size="14" ` +
      `fill="${ink}" text-anchor="end">${escapeXml(cut(value, 30))}</text>`;
  });

  lines.forEach((line, index) => {
    body +=
      `<text x="${INFO_PAD}" y="${round(textBaseline + index * 14)}" font-family="${FONT}" ` +
      `font-size="11" fill="${ink}" opacity="0.62">${escapeXml(line)}</text>`;
  });

  return svg(INFO_H, body);
}

/**
 * The card as markdown. The query goes after `data:image/svg+xml` and before the
 * comma that starts the payload, because that comma is where the parser splits
 * (`markdown-model.cpp` → `parseImageSize`); the `#x` fragment keeps the query
 * out of the encoded SVG.
 */
export function cardToMarkdown(card: string, height: number = CARD_H): string {
  const encoded = encodeURIComponent(card).replace(/\(/g, "%28").replace(/\)/g, "%29");
  return `![](data:image/svg+xml?raycast-width=${CARD_W}&raycast-height=${height}#x,${encoded})`;
}

/**
 * The card that opens a menu row: its name, a hairline and its own words. Menus
 * are not opened yet, so there is no cover to frame and one card is the pane.
 */
export function headerCard(title: string, description: string): string {
  let body =
    `<text x="${INFO_PAD}" y="50" font-family="${FONT}" font-size="24" font-weight="700" ` +
    `fill="${ink}">${escapeXml(cut(title, 28))}</text>` +
    `<rect x="${INFO_PAD}" y="70" width="${CARD_W - INFO_PAD * 2}" height="1" fill="${ink}" opacity="0.14"/>`;

  wrap(description, BLURB_CHARS, BLURB_LINES).forEach((line, index) => {
    body +=
      `<text x="${INFO_PAD}" y="${96 + index * 22}" font-family="${FONT}" font-size="13" ` +
      `fill="${ink}" opacity="0.62">${escapeXml(line)}</text>`;
  });

  return svg(INFO_H, body);
}
