import { useEffect, useState } from "react";

import { artworkFor, type Artwork } from "~/utils/artwork";

/**
 * The detail pane's picture: the cover in a card, framed by a blown-up copy of
 * itself.
 *
 * A markdown image is capped by `MdImage.qml` at `min(200, 0.7 × markdown
 * height)`, so the card is drawn at 420×200 and the pane shrinks it without
 * changing its shape. The cover inside keeps its own shape too: YouTube Music
 * serves square album art and 16:9 video thumbnails, and stretching either is
 * worse than a narrower card. The shape comes from the bytes, never assumed.
 */
export const CARD_W = 420;
export const CARD_H = 200;

/**
 * The card under the cover: the title, the artist and the facts. A `metadata`
 * bar would take the height the two cards need and leave a gap between them, so
 * the pane is cards top to bottom.
 */
const COVER_H = 180;
const INFO_H = 180;

/** Inset of the framed cover from the card edge. */
const PAD = 18;
const RADIUS = 14;
const ART_RADIUS = 8;
const INFO_PAD = 20;
const INK = "#e6e7ea";
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

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
  /** An album's or a playlist's own words, drawn at the foot of the facts card. */
  description?: string;
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
    cardToMarkdown(coverCard(art.href, art.size, COVER_H), COVER_H),
    cardToMarkdown(infoCard(pane.title, pane.subtitle, pane.rows, pane.description), INFO_H),
  ].join("\n\n");
}

export function useTrackPane(pane: Pane): string {
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
      return { width: be16(26) & 0x3fff, height: be16(28) & 0x3fff };
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
export function coverCard(href: string, size: Size | undefined, height: number = CARD_H): string {
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
      `<rect width="${CARD_W}" height="${height}" fill="#0b0d10"/>` +
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
  } else {
    body += `<rect width="${CARD_W}" height="${height}" fill="#14171c"/>`;
  }

  body += `</g>`;
  return svg(height, body);
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
  let body = `<rect width="${CARD_W}" height="${INFO_H}" rx="${RADIUS}" fill="#14171c"/>`;
  body +=
    `<text x="${INFO_PAD}" y="44" font-family="${FONT}" font-size="21" font-weight="700" ` +
    `fill="${INK}">${escapeXml(cut(title, 32))}</text>`;

  if (subtitle) {
    body +=
      `<text x="${INFO_PAD}" y="66" font-family="${FONT}" font-size="13" fill="${INK}" ` +
      `opacity="0.62">${escapeXml(cut(subtitle, 54))}</text>`;
  }

  const top = 84;
  body +=
    `<rect x="${INFO_PAD}" y="${top}" width="${CARD_W - INFO_PAD * 2}" height="1" ` +
    `fill="${INK}" opacity="0.14"/>`;

  // Free text sits at the foot of the card, so the rows share what is above it.
  const lines = description ? wrap(description) : [];
  const textBaseline = INFO_H - 16 - (lines.length - 1) * 14;
  const bottom = lines.length > 0 ? textBaseline - 10 : INFO_H - 6;

  const step = (bottom - top) / Math.max(rows.length, 1);
  rows.forEach(([label, value], index) => {
    const centre = top + step * (index + 0.5);
    body +=
      `<text x="${INFO_PAD}" y="${round(centre + 4)}" font-family="${FONT}" font-size="10" ` +
      `font-weight="700" letter-spacing="1.3" fill="${INK}" opacity="0.5">${escapeXml(label.toUpperCase())}</text>` +
      `<text x="${CARD_W - INFO_PAD}" y="${round(centre + 5)}" font-family="${FONT}" font-size="14" ` +
      `fill="${INK}" text-anchor="end">${escapeXml(cut(value, 30))}</text>`;
  });

  lines.forEach((line, index) => {
    body +=
      `<text x="${INFO_PAD}" y="${round(textBaseline + index * 14)}" font-family="${FONT}" ` +
      `font-size="11" fill="${INK}" opacity="0.62">${escapeXml(line)}</text>`;
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

/** A line of a page preview: what is on the page, and a word about it. */
export type PreviewLine = [name: string, detail: string];

const PREVIEW_LINES = 5;

/**
 * The card that opens a page preview: its name, a hairline and its own words.
 * Pages that are not opened yet have no cover, so the pane is these two text
 * cards instead of a picture and facts.
 */
export function headerCard(title: string, description: string): string {
  let body = `<rect width="${CARD_W}" height="${INFO_H}" rx="${RADIUS}" fill="#14171c"/>`;
  body +=
    `<text x="${INFO_PAD}" y="50" font-family="${FONT}" font-size="24" font-weight="700" ` +
    `fill="${INK}">${escapeXml(cut(title, 28))}</text>` +
    `<rect x="${INFO_PAD}" y="70" width="${CARD_W - INFO_PAD * 2}" height="1" fill="${INK}" opacity="0.14"/>`;

  wrap(description, BLURB_CHARS, BLURB_LINES).forEach((line, index) => {
    body +=
      `<text x="${INFO_PAD}" y="${96 + index * 22}" font-family="${FONT}" font-size="13" ` +
      `fill="${INK}" opacity="0.62">${escapeXml(line)}</text>`;
  });

  return svg(INFO_H, body);
}

/**
 * What the page holds, one line each: the name on the left, the word about it
 * on the right. `note` stands in for the lines while they load, fail or are
 * absent, so the card keeps its shape.
 */
export function listCard(lines: PreviewLine[], note?: string): string {
  let body = `<rect width="${CARD_W}" height="${INFO_H}" rx="${RADIUS}" fill="#14171c"/>`;

  if (note !== undefined) {
    body +=
      `<text x="${CARD_W / 2}" y="${INFO_H / 2 + 5}" font-family="${FONT}" font-size="13" ` +
      `fill="${INK}" opacity="0.5" text-anchor="middle">${escapeXml(cut(note, 54))}</text>`;
    return svg(INFO_H, body);
  }

  const shown = lines.slice(0, PREVIEW_LINES);
  const step = (INFO_H - 16) / PREVIEW_LINES;
  shown.forEach(([name, detail], index) => {
    const centre = 8 + step * (index + 0.5);
    body +=
      `<text x="${INFO_PAD}" y="${round(centre + 5)}" font-family="${FONT}" font-size="14" ` +
      `fill="${INK}">${escapeXml(cut(name, 26))}</text>` +
      `<text x="${CARD_W - INFO_PAD}" y="${round(centre + 5)}" font-family="${FONT}" font-size="12" ` +
      `fill="${INK}" opacity="0.5" text-anchor="end">${escapeXml(cut(detail, 22))}</text>`;
    if (index < shown.length - 1) {
      body += `<rect x="${INFO_PAD}" y="${round(centre + step / 2)}" width="${CARD_W - INFO_PAD * 2}" height="1" fill="${INK}" opacity="0.08"/>`;
    }
  });

  return svg(INFO_H, body);
}

/** The preview pane: the page's header card over the card of what it holds. */
export function previewMarkdown(title: string, description: string, lines: PreviewLine[], note?: string): string {
  return [
    cardToMarkdown(headerCard(title, description), INFO_H),
    cardToMarkdown(listCard(lines, note), INFO_H),
  ].join("\n\n");
}
