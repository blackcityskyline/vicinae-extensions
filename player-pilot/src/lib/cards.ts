/**
 * The detail pane's picture, drawn as two cards the way `ytmusic` and
 * `weather-fox` do it.
 *
 * A markdown image is capped by `MdImage.qml` at `min(200, 0.7 × pane)`, so a
 * lone cover leaves the bottom quarter of the pane empty. Two cards, each
 * declared in the URL with `?raycast-width/-height` (`markdown-model.cpp` reads
 * exactly those, not the SVG header), fill it: the cover on top, the title and
 * the facts under it.
 */
export const CARD_W = 420;
export const COVER_H = 180;
export const INFO_H = 180;

/** Drawn at 2×: the card is scaled down to its box, text stays crisp. */
const S = 2;
/** Inset of the framed cover from the card edge. */
const PAD = 18;
const RADIUS = 14;
const ART_RADIUS = 8;
const INFO_PAD = 20;
const INK = "#e6e7ea";
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

export type Size = { width: number; height: number };
export type Row = [label: string, value: string];

/**
 * The intrinsic size of JPEG, PNG, GIF or WebP bytes. Anything else answers
 * `undefined` and the card falls back to a plain background rather than a
 * guessed shape: players hand over square album art, 16:9 video frames and
 * letterboxed thumbnails, and stretching any of them is worse than a narrower
 * card.
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

/** One line, cut with an ellipsis: a card has no room to wrap. */
export function fit(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

const svg = (height: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W * S}" height="${height * S}" viewBox="0 0 ${CARD_W} ${height}">${body}</svg>`;

/**
 * The cover card. Behind the cover sits the same picture scaled to fill the whole
 * card and dimmed — the usual "blurred album background" without the blur, which
 * the SVG module does not render — so a square cover is framed rather than
 * marooned on a flat rectangle.
 */
export function coverCard(href: string, size: Size | undefined): string {
  const veil =
    `<linearGradient id="veil" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0%" stop-color="#0b0d10" stop-opacity="0.55"/>` +
    `<stop offset="100%" stop-color="#0b0d10" stop-opacity="0.9"/>` +
    `</linearGradient>`;

  let body = `<defs><clipPath id="card"><rect width="${CARD_W}" height="${COVER_H}" rx="${RADIUS}"/></clipPath>${veil}</defs>`;
  body += `<g clip-path="url(#card)">`;

  if (href && size && size.width > 0 && size.height > 0) {
    const fill = Math.max(CARD_W / size.width, COVER_H / size.height);
    const backW = size.width * fill;
    const backH = size.height * fill;
    body +=
      `<rect width="${CARD_W}" height="${COVER_H}" fill="#0b0d10"/>` +
      `<image x="${round((CARD_W - backW) / 2)}" y="${round((COVER_H - backH) / 2)}" ` +
      `width="${round(backW)}" height="${round(backH)}" opacity="0.5" href="${href}"/>` +
      `<rect width="${CARD_W}" height="${COVER_H}" fill="url(#veil)"/>`;

    const boxW = CARD_W - PAD * 2;
    const boxH = COVER_H - PAD * 2;
    const scale = Math.min(boxW / size.width, boxH / size.height);
    const artW = size.width * scale;
    const artH = size.height * scale;
    const x = (CARD_W - artW) / 2;
    const y = (COVER_H - artH) / 2;
    body +=
      `<image x="${round(x)}" y="${round(y)}" width="${round(artW)}" height="${round(artH)}" href="${href}"/>` +
      `<rect x="${round(x)}" y="${round(y)}" width="${round(artW)}" height="${round(artH)}" ` +
      `rx="${ART_RADIUS}" fill="none" stroke="#ffffff" stroke-opacity="0.16"/>`;
  } else {
    body += `<rect width="${CARD_W}" height="${COVER_H}" fill="#14171c"/>`;
  }

  body += `</g>`;
  return svg(COVER_H, body);
}

/**
 * The card under the cover: title, artist, and the facts as label/value rows.
 * Drawn rather than put in a `metadata` bar, which would take the height the
 * cards need and leave a gap between the cover and itself.
 */
export function infoCard(title: string, subtitle: string | undefined, rows: Row[]): string {
  let body = `<rect width="${CARD_W}" height="${INFO_H}" rx="${RADIUS}" fill="#14171c"/>`;
  body +=
    `<text x="${INFO_PAD}" y="44" font-family="${FONT}" font-size="21" font-weight="700" ` +
    `fill="${INK}">${escapeXml(fit(title, 32))}</text>`;

  if (subtitle) {
    body +=
      `<text x="${INFO_PAD}" y="66" font-family="${FONT}" font-size="13" fill="${INK}" ` +
      `opacity="0.62">${escapeXml(fit(subtitle, 54))}</text>`;
  }

  const top = 84;
  body +=
    `<rect x="${INFO_PAD}" y="${top}" width="${CARD_W - INFO_PAD * 2}" height="1" ` +
    `fill="${INK}" opacity="0.14"/>`;

  const step = (INFO_H - 6 - top) / Math.max(rows.length, 1);
  rows.forEach(([label, value], index) => {
    const centre = top + step * (index + 0.5);
    body +=
      `<text x="${INFO_PAD}" y="${round(centre + 4)}" font-family="${FONT}" font-size="10" ` +
      `font-weight="700" letter-spacing="1.3" fill="${INK}" opacity="0.5">${escapeXml(label.toUpperCase())}</text>` +
      `<text x="${CARD_W - INFO_PAD}" y="${round(centre + 5)}" font-family="${FONT}" font-size="14" ` +
      `fill="${INK}" text-anchor="end">${escapeXml(fit(value, 30))}</text>`;
  });

  return svg(INFO_H, body);
}

/**
 * A card as markdown, in the box the pane should give it.
 *
 * The query goes after `data:image/svg+xml` and before the comma that starts the
 * payload, because that comma is where the parser splits (`markdown-model.cpp` →
 * `parseImageSize`); the `#x` fragment keeps the query out of the encoded SVG.
 */
export function cardToMarkdown(card: string, height: number): string {
  const encoded = encodeURIComponent(card).replace(/\(/g, "%28").replace(/\)/g, "%29");
  return `![](data:image/svg+xml?raycast-width=${CARD_W}&raycast-height=${height}#x,${encoded})`;
}
