/**
 * The detail pane's picture, drawn as two cards the way `weather-fox` does it.
 *
 * A markdown image is capped by `MdImage.qml` at `min(200, 0.7 × pane height)`,
 * so a lone cover can never reach the bottom of the pane — the quarter under it
 * stays empty. Two cards, each declared in the URL with `?raycast-width/-height`
 * (`markdown-model.cpp` reads exactly those, not the SVG header), fill the pane
 * instead: the cover on top, the track's facts under the line that opens the
 * second card.
 */
export const CARD_W = 420;
export const COVER_H = 180;
export const ROWS_H = 180;

/** Drawn at 2×: the card is scaled down to its box, text stays crisp. */
const S = 2;
const PAD = 22;
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

export type Appearance = "light" | "dark";
export type CardBox = { width: number; height: number };
export type Row = [label: string, value: string];

const ink = (appearance: Appearance) => (appearance === "dark" ? "#e6e7ea" : "#1b1d21");

export function escapeXml(text: string): string {
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

const svg = (w: number, h: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;

/**
 * The cover on top of the facts, nothing else: the artwork is cropped to the card
 * (a square laid out over it, clipped) so it always fills, whatever the source
 * shape, and a shade under the title keeps white text readable.
 */
export function coverCard(art: string, title: string, subtitle: string): string {
  const w = CARD_W * S;
  const h = COVER_H * S;
  const size = w;
  const shade =
    `<linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="40%" stop-color="#000000" stop-opacity="0"/>` +
    `<stop offset="100%" stop-color="#000000" stop-opacity="0.85"/>` +
    `</linearGradient>`;
  const body =
    `<defs><clipPath id="card"><rect width="${w}" height="${h}" rx="${12 * S}"/></clipPath>${shade}</defs>` +
    `<g clip-path="url(#card)">` +
    `<rect width="${w}" height="${h}" fill="#000000"/>` +
    (art ? `<image x="0" y="${(h - size) / 2}" width="${size}" height="${size}" href="${art}"/>` : "") +
    `<rect width="${w}" height="${h}" fill="url(#shade)"/>` +
    `<text x="${PAD * S}" y="${h - 54 * S}" font-family="${FONT}" font-size="${13 * S}" ` +
    `fill="#ffffff" opacity="0.8">${escapeXml(fit(subtitle, 48))}</text>` +
    `<text x="${PAD * S}" y="${h - 20 * S}" font-family="${FONT}" font-size="${22 * S}" font-weight="700" ` +
    `fill="#ffffff">${escapeXml(fit(title, 28))}</text>` +
    `</g>`;
  return svg(w, h, body);
}

/**
 * The facts. The line across the top is the pane's divider, the one the metadata
 * bar used to draw — the bar itself would take the height the cards need.
 */
export function factsCard(rows: Row[], appearance: Appearance): string {
  const w = CARD_W * S;
  const h = ROWS_H * S;
  const colour = ink(appearance);
  const rowH = h / Math.max(rows.length, 1);
  const cells = rows
    .map(([label, value], i) => {
      const cy = rowH * (i + 0.5);
      return (
        `<text x="${PAD * S}" y="${cy + 4 * S}" font-family="${FONT}" font-size="${10 * S}" font-weight="700" ` +
        `letter-spacing="${1.3 * S}" fill="${colour}" opacity="0.55">${escapeXml(label.toUpperCase())}</text>` +
        `<text x="${w - PAD * S}" y="${cy + 5 * S}" font-family="${FONT}" font-size="${14 * S}" ` +
        `fill="${colour}" text-anchor="end">${escapeXml(fit(value, 32))}</text>`
      );
    })
    .join("");
  return svg(
    w,
    h,
    `<rect width="${w}" height="${2}" fill="${colour}" opacity="0.16"/>${cells}`,
  );
}

/**
 * A card as markdown, in the box the pane should give it.
 *
 * The query goes after `data:image/svg+xml` and before the comma that starts the
 * payload, because that comma is where the parser splits; the `#x` fragment keeps
 * the query out of the encoded SVG.
 */
export function cardToMarkdown(card: string, box: CardBox): string {
  const encoded = encodeURIComponent(card).replace(/\(/g, "%28").replace(/\)/g, "%29");
  return `![](data:image/svg+xml?raycast-width=${box.width}&raycast-height=${box.height}#x,${encoded})`;
}
