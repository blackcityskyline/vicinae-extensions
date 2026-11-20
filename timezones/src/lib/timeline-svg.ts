import { shadeOf, type Shade } from "../core/business";
import { formatDateLong, formatDelta, formatGmtOffset, formatTime, formatWeekday, type TimeFormat } from "../core/format";
import { dayNumber, localHourStart, localNoon, wallParts, zoneOffset } from "../core/time";
import type { HourRange } from "../core/types";
import type { Coords } from "./coords";
import { sunTimes, type SunPair } from "./sun";

export type TimelineRow = {
  label: string;
  tz: string;
  business?: HourRange;
  shoulder?: HourRange;
  coords?: Coords;
  isBase?: boolean;
  isLocal?: boolean;
};

export type Marker = { at: number; label: string; color?: string; end?: number };

type TimelineConfig = {
  /** The instant the cursor sits on, ms since epoch. */
  cursorAt: number;
  /** The real current time: the green line, and the clocks in the headers. */
  nowAt: number;
  /** Zone the cursor reads in: the home location, or where the user is. */
  baseTz: string;
  /** Rows in display order. */
  rows: TimelineRow[];
  timeFormat: TimeFormat;
  dark: boolean;
  /** Hex overrides per shade for the cells; the built-in palette fills the gaps. */
  colors?: Partial<Record<Shade, string>>;
  /** Replaces the per-row business/shoulder ranges, e.g. with market hours that know weekends and DST. */
  shade?: (instant: number, tz: string) => Shade;
  /** A colour for the "business" cells of a row, in place of the palette's green. The legend then keeps only the closed swatch. */
  rowColor?: (tz: string) => string | undefined;
  /**
   * Vertical lines at these instants, named above the chart in the marker's colour. One with an `end` is also a
   * bar across the top of the chart from its start to that instant, the tail of a window that began earlier included.
   */
  markers?: Marker[];
  /** The legend line for the markers: a caption and one entry per session, each with a note beside its name. */
  markerLegend?: { caption?: string; items: { label: string; color?: string; note?: string }[] };
  /** Legend wording for the three shades; without it the business/working-hours words are used. */
  legend?: { business: string; shoulder?: string; off: string };
  /** Sunrise and sunset need coordinates the market view has no use for. Default true. */
  showSun?: boolean;
};

/**
 * The pane's content area is 356 px tall and 728 px wide (measured on a 798×508 window), and Vicinae caps one
 * markdown image at 200 px tall (`MdImage.qml`), so the timeline is drawn as two images whose boxes add up to
 * the pane: 174 + 8 (the paragraph gap) + 174. Both carry `raycast-height` and `raycast-width` in their URL,
 * without which every image would sit in a 200 px letterboxed box.
 */
export const TIMELINE_WIDTH = 728;
export const TIMELINE_PART_HEIGHT = 174;

const HOURS_VISIBLE = 24;
const CURSOR_COLUMN = 12;
const CELL_W = 29;
const CELL_GAP = 3;
const PAD_X = 16;
const TITLE_H = 20;
const LEGEND_H = 18;
/** Height of one row of open labels above the chart; the first row shares the title's baseline. */
const LABEL_PITCH = 9;
const LABEL_BASELINE = TITLE_H - 6;
const LABEL_FONT = 7;
const LABEL_GAP = 4;
const BAR_H = 3;
const BAR_PITCH = 5;
const LEGEND_ROW_H = 10;
const FONT = "-apple-system, 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif";

const CHART_W = HOURS_VISIBLE * CELL_W;

/** The hour-strip palette, reused so the timeline and the strip colour the same hours the same way. */
const CELLS: Record<Shade, { light: string; dark: string }> = {
  business: { light: "#7cc47f", dark: "#3f8f45" },
  shoulder: { light: "#f0d264", dark: "#a8891f" },
  off: { light: "#e5e7eb", dark: "#3a3f4b" },
};

const CELL_TEXT: Record<Shade, { light: string; dark: string }> = {
  business: { light: "#111111", dark: "#ffffff" },
  shoulder: { light: "#111111", dark: "#ffffff" },
  off: { light: "#6e7781", dark: "#9aa0a6" },
};

type Palette = {
  text: string;
  muted: string;
  accent: string;
  cursorText: string;
  now: string;
  badgeGmt: string;
  badgeDelta: string;
  badgeLocal: string;
  marker: string;
  cells: Record<Shade, { fill: string; text: string }>;
};

function palette(config: TimelineConfig): Palette {
  const theme = config.dark ? "dark" : "light";
  const cells = {} as Record<Shade, { fill: string; text: string }>;
  for (const shade of ["business", "shoulder", "off"] as const) {
    cells[shade] = { fill: config.colors?.[shade] ?? CELLS[shade][theme], text: CELL_TEXT[shade][theme] };
  }
  return config.dark
    ? {
        text: "#e6edf3",
        muted: "#9aa0a6",
        accent: "#ff6363",
        cursorText: "#ff8f8f",
        now: "#1a9e6b",
        badgeGmt: "#6ea8fe",
        badgeDelta: "#c792ea",
        badgeLocal: "#f0b429",
        marker: "#c792ea",
        cells,
      }
    : {
        text: "#24292f",
        muted: "#6e7781",
        accent: "#ff6363",
        cursorText: "#d42a2a",
        now: "#1a9e6b",
        badgeGmt: "#2b6fd6",
        badgeDelta: "#8a3ffc",
        badgeLocal: "#b07d00",
        marker: "#8a3ffc",
        cells,
      };
}

type TimelineRowView = {
  tz: string;
  label: string;
  cursorOffset: number;
  deltaMinutes: number;
  dayDiff: string;
  isBase: boolean;
  isLocal: boolean;
  sun: SunPair;
  business?: HourRange;
  shoulder?: HourRange;
};

// Vertical geometry of one part. Rows share the space the title and the legend leave free, so any number of
// locations lands in the same 174 px box.
type RowMetrics = { height: number; header: number; cellTop: number; cellH: number };

function rowMetrics(count: number, top: number, bottom: number): RowMetrics {
  const height = (bottom - top) / Math.max(count, 1);
  return { height, header: height * 0.26, cellTop: height * 0.4, cellH: height * 0.46 };
}

// Tag for SVG markup templates: rounds interpolated numbers to one decimal, so computed coordinates don't
// bloat the markup with values like 287.43999999999994.
function svg(strings: TemplateStringsArray, ...values: (string | number)[]): string {
  return strings.reduce((markup, part, i) => {
    if (i === 0) return part;
    const value = values[i - 1];
    return markup + (typeof value === "number" ? Math.round(value * 10) / 10 : value) + part;
  }, "");
}

// The renderer ignores font-weight in stylesheets, so text is drawn through text(), which sets the weight
// as an attribute.
const BOLD_TEXT = new Set(["title", "time", "city", "day-diff", "badge", "cursor-label", "now-label", "weekday"]);

// Draws a text element. The first class decides whether it is bold; `bold` makes any text bold.
function text(
  classes: string,
  x: number,
  y: number,
  content: string,
  options: { bold?: boolean; attrs?: string } = {},
): string {
  const bold = options.bold || BOLD_TEXT.has(classes.split(" ")[0] ?? "");
  return (
    svg`<text class="${classes}" x="${x}" y="${y}"` +
    (bold ? ` font-weight="bold"` : "") +
    (options.attrs ? ` ${options.attrs}` : "") +
    `>${escapeXml(content)}</text>`
  );
}

// Text and colour styles, so elements only need a class instead of repeating the same attributes. Only plain
// class selectors are used, for compatibility with simple SVG renderers.
function stylesheet(p: Palette, colors: string[]): string {
  // A session's own colour needs its own class, since the renderer only reads classes.
  const own = colors
    .map(
      (color, i) =>
        `.mk${i} { stroke: ${color}; stroke-width: 1; stroke-dasharray: 3 2; } .mt${i} { font-size: 7px; fill: ${color}; } .mb${i} { fill: ${color}; } .mc${i} { fill: ${color}; }`,
    )
    .join("\n    ");
  return `<style>
    text { font-family: ${FONT}; }
    .title { font-size: 12px; fill: ${p.text}; }
    .time { font-size: 10px; fill: ${p.text}; }
    .city { font-size: 10px; fill: ${p.text}; }
    .day-diff { font-size: 7.5px; fill: ${p.accent}; }
    .badge-bg { fill-opacity: 0.18; }
    .badge { font-size: 6.5px; text-anchor: middle; fill-opacity: 0.85; }
    .gmt { fill: ${p.badgeGmt}; }
    .delta { fill: ${p.badgeDelta}; }
    .local { fill: ${p.badgeLocal}; }
    .sun { font-size: 7.5px; fill: ${p.muted}; }
    .sun-icon { fill: none; stroke: ${p.muted}; stroke-width: 24; stroke-linecap: round; stroke-linejoin: round; }
    .cursor-label { font-size: 7.5px; fill: ${p.cursorText}; }
    .now-label { font-size: 7px; text-anchor: middle; fill: ${p.now}; }
    .now-line { stroke: ${p.now}; stroke-width: 1.5; }
    .marker-line { stroke: ${p.marker}; stroke-width: 1; stroke-dasharray: 3 2; }
    .marker-label { font-size: 7px; fill: ${p.marker}; }
    .marker-bar { fill: ${p.marker}; }
    .cursor-line { stroke: ${p.accent}; stroke-width: 1.5; }
    .hour { font-size: 8px; text-anchor: middle; }
    .weekday { font-size: 6.5px; text-anchor: middle; }
    .business { fill: ${p.cells.business.fill}; }
    .business-text { fill: ${p.cells.business.text}; }
    .shoulder { fill: ${p.cells.shoulder.fill}; }
    .shoulder-text { fill: ${p.cells.shoulder.text}; }
    .off { fill: ${p.cells.off.fill}; }
    .off-text { fill: ${p.cells.off.text}; }
    .legend { font-size: 8px; fill: ${p.muted}; }
    ${own}
  </style>`;
}

// Sunrise/sunset glyphs drawn as paths (16px), since SF Symbols are not available inside the image.
function sunIcon(kind: "rise" | "set", x: number, y: number): string {
  const arrow = kind === "rise" ? "M138 98V32 M108 62L138 32L168 62" : "M138 32V98 M108 68L138 98L168 68";
  return (
    svg`<g class="sun-icon" transform="translate(${x} ${y}) scale(0.041)">` +
    `<path d="M15 222H260 M30 182H58 M218 182H246 M68 110L86 128 M212 110L194 128 ${arrow}"/>` +
    `<circle cx="140" cy="175" r="48"/></g>`
  );
}

// Rough text width for positioning badges next to text (SVG offers no text measurement).
function estimateTextWidth(text: string, fontSize: number): number {
  let width = 0;
  for (const char of text) {
    if (/[0-9]/.test(char)) width += 0.6;
    else if (/[ilj.,:'|!tf]/.test(char)) width += 0.28;
    else if (char === "r") width += 0.38;
    else if (/[mwMW]/.test(char)) width += 0.88;
    else if (/[A-Z]/.test(char)) width += 0.68;
    else if (char === " ") width += 0.28;
    else width += 0.56;
  }
  return width * fontSize;
}

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Places the cursor time label next to the cursor line in the header line of a row: preferably on the side
// away from the "now" line, and never over the header text and badges on the left or the sun times on the
// right.
function placeCursorLabel(
  cursorX: number,
  nowX: number | null,
  width: number,
  minX: number,
  maxX: number,
): { x: number; anchor: "start" | "end" } {
  type Side = { x: number; anchor: "start" | "end"; left: number; right: number };
  const gap = 4;
  const right: Side = { x: cursorX + gap, anchor: "start", left: cursorX + gap, right: cursorX + gap + width };
  const left: Side = { x: cursorX - gap, anchor: "end", left: cursorX - gap - width, right: cursorX - gap };
  const sides = nowX !== null && nowX > cursorX ? [left, right] : [right, left];
  const fits = (side: Side) =>
    side.left >= minX && side.right <= maxX && (nowX === null || nowX < side.left - 2 || nowX > side.right + 2);
  const side = sides.find(fits) ?? sides.find((candidate) => candidate.left >= minX && candidate.right <= maxX);
  if (side) return { x: side.x, anchor: side.anchor };
  return { x: Math.max(right.x, minX), anchor: "start" };
}

// Horizontal positions shared by every row's header, so the city names and badges each line up in a column.
type HeaderLayout = { cityX: number; badgeX: number; gmtWidth: number };

const badgeWidth = (label: string) => estimateTextWidth(label, 6.5) * 1.1 + 10;

function headerLayout(rows: TimelineRowView[], timeFormat: TimeFormat): HeaderLayout {
  const timeColumnWidth = estimateTextWidth(timeFormat === "24h" ? "00:00" : "00:00 AM", 10) * 1.06;
  const cityX = PAD_X + timeColumnWidth + 6;
  const headerEnds = rows.map(
    (row) =>
      cityX + estimateTextWidth(row.label, 10) + (row.dayDiff ? 4 + estimateTextWidth(row.dayDiff.trim(), 7.5) : 0),
  );
  return {
    cityX,
    badgeX: (headerEnds.length > 0 ? Math.max(...headerEnds) : cityX) + 8,
    gmtWidth: Math.max(...rows.map((row) => badgeWidth(formatGmtOffset(row.cursorOffset))), badgeWidth("GMT+0")),
  };
}

/** "" when the row is on the base's date, else " +1" / " -1". */
function dayDiff(instant: number, tz: string, baseTz: string): string {
  const difference = dayNumber(instant, tz) - dayNumber(instant, baseTz);
  if (difference === 0) return "";
  return difference > 0 ? ` +${difference}` : ` ${difference}`;
}

function renderRow(
  row: TimelineRowView,
  top: number,
  metrics: RowMetrics,
  baseHourStartMs: number,
  cursorMs: number,
  nowMs: number,
  lines: { cursorX: number | null; nowX: number | null },
  timeFormat: TimeFormat,
  layout: HeaderLayout,
  shadeFn: ((instant: number, tz: string) => Shade) | undefined,
  showSun: boolean,
  cellClass: (shade: Shade) => string,
): string {
  const cellTop = top + metrics.cellTop;
  const chartLeft = PAD_X;
  const bandCenterMs = baseHourStartMs + 30 * 60 * 1000;
  // Each row is laid out on its own local hour grid, positioned by absolute time, so zones with fractional
  // offsets (e.g. +5:30) stay aligned with the shared cursor column.
  const anchorMs = localHourStart(bandCenterMs, row.tz);

  const gmt = formatGmtOffset(row.cursorOffset);
  // The header clock reads now, the cursor label reads the cursor: the line may be scrubbed away while the
  // row still answers "what time is it there".
  const timeText = formatTime(nowMs, row.tz, timeFormat);
  const chartRight = chartLeft + CHART_W;
  const baseline = top + metrics.header;

  let markup = "";
  // Times start at the chart's left edge; city names and badges sit in columns shared by all rows.
  markup += text("time", chartLeft + 1, baseline, timeText);
  markup += text("city", layout.cityX, baseline, row.label);
  // The day difference is a separate <text> rather than a <tspan>: some renderer versions shift the whole
  // line's baseline down when a text element mixes font sizes, misaligning the city name with the time.
  if (row.dayDiff) {
    const dayDiffX = layout.cityX + estimateTextWidth(row.label, 10) + 4;
    markup += text("day-diff", dayDiffX, baseline, row.dayDiff.trim());
  }

  // Badges are vertically centered on the capital letters of the time and city name.
  const badges = [{ text: gmt, kind: "gmt", width: layout.gmtWidth }];
  if (!row.isBase) {
    const delta = formatDelta(row.deltaMinutes);
    badges.push({ text: delta, kind: "delta", width: badgeWidth(delta) });
  }
  if (row.isLocal) badges.push({ text: "Local", kind: "local", width: badgeWidth("Local") });
  let badgeX = layout.badgeX;
  for (const badge of badges) {
    markup += svg`<rect class="badge-bg ${badge.kind}" x="${badgeX}" y="${baseline - 10.5}" width="${badge.width}" height="13.5" rx="3.5"/>`;
    markup += text(`badge ${badge.kind}`, badgeX + badge.width / 2, baseline - 1, badge.text);
    badgeX += badge.width + 5;
  }

  const sunTimeWidth = estimateTextWidth(timeFormat === "24h" ? "00:00" : "00:00 AM", 7.5);
  const sunItemWidth = 12 + sunTimeWidth;
  const sunsetX = chartRight - sunItemWidth;
  const sunriseX = sunsetX - 10 - sunItemWidth;
  if (showSun) {
    markup += sunIcon("rise", sunriseX, top + 1);
    markup += text("sun", sunriseX + 12, baseline, row.sun.sunrise);
    markup += sunIcon("set", sunsetX, top + 1);
    markup += text("sun", sunsetX + 12, baseline, row.sun.sunset);
  }

  if (lines.cursorX !== null) {
    const cursorText = formatTime(cursorMs, row.tz, timeFormat);
    const width = estimateTextWidth(cursorText, 7.5) * 1.1;
    const label = placeCursorLabel(
      lines.cursorX,
      lines.nowX,
      width,
      badgeX + 3,
      showSun ? sunriseX - 6 : chartRight - 6,
    );
    markup += text("cursor-label", label.x, baseline, cursorText, { attrs: `text-anchor="${label.anchor}"` });
  }

  // Cells are clipped to the chart by hand rather than with <clipPath>: some renderer versions render a
  // clipPath's rect as a filled black box instead of using it as a clip.
  for (let j = -CURSOR_COLUMN - 2; j <= HOURS_VISIBLE - CURSOR_COLUMN + 1; j++) {
    const cellMs = anchorMs + j * 3_600_000;
    const parts = wallParts(cellMs, row.tz);
    // The override answers for the middle of the cell, which is what the cell stands for.
    const shade = shadeFn
      ? shadeFn(cellMs + 30 * 60_000, row.tz)
      : row.business && row.shoulder
        ? shadeOf(parts.h + parts.min / 60, row.business, row.shoulder)
        : "off";
    const x = chartLeft + CURSOR_COLUMN * CELL_W + ((cellMs - baseHourStartMs) / 3_600_000) * CELL_W;
    const left = Math.max(x + CELL_GAP / 2, chartLeft);
    const right = Math.min(x + CELL_W - CELL_GAP / 2, chartRight);
    if (right - left < 1) continue;

    const isCursor = cellMs <= cursorMs && cursorMs < cellMs + 3_600_000;
    const centerX = x + CELL_W / 2;
    const centerY = cellTop + metrics.cellH / 2;

    markup += svg`<rect class="${cellClass(shade)}" x="${left}" y="${cellTop}" width="${right - left}" height="${metrics.cellH}" rx="${Math.min(4, (right - left) / 2)}"/>`;
    // Labels are only drawn on fully visible cells, so they never spill past the chart edges.
    if (right - left < CELL_W - CELL_GAP - 0.5) continue;
    markup +=
      parts.h === 0 && parts.min === 0
        ? // Baseline sits half a cap height below the center (dominant-baseline is not supported everywhere).
          text(`weekday ${shade}-text`, centerX, centerY + 2.6, formatWeekday(cellMs, row.tz), {
            attrs: svg`transform="rotate(-90 ${centerX} ${centerY})"`,
          })
        : text(`hour ${shade}-text`, centerX, cellTop + metrics.cellH * 0.72, String(parts.h), { bold: isCursor });
  }

  return markup;
}

type MarkerLabel = {
  label: string;
  /** Where the open's line is drawn. */
  x: number;
  /** Where its label is centred: the line, pulled inside the chart edge. */
  labelX: number;
  /** 0 on the title's baseline, then one `LABEL_PITCH` lower per row. */
  row: number;
  color?: string;
};

/**
 * Puts a label on each open inside the chart, on the first row where it fits beside the others. Row 0 shares
 * the title's baseline, so the date and the "now" label are spoken for there; opens in the same minute and
 * neighbours too close to sit side by side stack onto the rows below. The result is in the markers' order.
 */
export function layoutMarkerLabels(
  markers: Marker[],
  baseHourStartMs: number,
  nowLabelX: number | null,
  title: string,
): MarkerLabel[] {
  const chartRight = PAD_X + CHART_W;
  type Span = { left: number; right: number };
  const rows: Span[][] = [[{ left: PAD_X, right: PAD_X + estimateTextWidth(title, 12) * 1.1 + LABEL_GAP }]];
  if (nowLabelX !== null) {
    const half = estimateTextWidth("now", LABEL_FONT) / 2 + LABEL_GAP / 2;
    rows[0]!.push({ left: nowLabelX - half, right: nowLabelX + half });
  }

  const visible = markers
    .map((marker, index) => ({ marker, index, x: PAD_X + CURSOR_COLUMN * CELL_W + ((marker.at - baseHourStartMs) / 3_600_000) * CELL_W }))
    .filter(({ x }) => x >= PAD_X && x <= chartRight);

  const placed: MarkerLabel[] = [];
  for (const { marker, index, x } of [...visible].sort((a, b) => a.x - b.x || a.index - b.index)) {
    const width = estimateTextWidth(marker.label, LABEL_FONT);
    const labelX = Math.min(Math.max(x, PAD_X + width / 2), chartRight - width / 2);
    const span = { left: labelX - width / 2 - LABEL_GAP / 2, right: labelX + width / 2 + LABEL_GAP / 2 };
    let row = 0;
    while ((rows[row] ?? []).some((taken) => span.left < taken.right && span.right > taken.left)) row++;
    (rows[row] ??= []).push(span);
    placed[index] = { label: marker.label, x, labelX, row, color: marker.color };
  }
  return placed.filter((entry): entry is MarkerLabel => entry !== undefined);
}

/** The lane of each bar, lowest first, so bars that overlap in x never share one. */
export function layoutBarLanes(bars: { x1: number; x2: number }[]): number[] {
  const laneEnds: number[] = [];
  const lanes: number[] = [];
  const order = bars.map((_, i) => i).sort((a, b) => bars[a]!.x1 - bars[b]!.x1 || a - b);
  for (const i of order) {
    let lane = laneEnds.findIndex((end) => end <= bars[i]!.x1);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = bars[i]!.x2;
    lanes[i] = lane;
  }
  return lanes;
}

type LegendEntry = { text: string; x: number; row: number };

/** Where each legend entry goes: left to right, onto the next row once the chart's width is used up. */
export function layoutLegend(items: string[], startX: number, maxX: number): LegendEntry[] {
  const placed: { text: string; x: number; row: number }[] = [];
  let x = startX;
  let row = 0;
  for (const text of items) {
    const width = 14 + estimateTextWidth(text, 8) + 14;
    if (x > startX && x + width > maxX) {
      row++;
      x = PAD_X;
    }
    placed.push({ text, x, row });
    x += width;
  }
  return placed;
}

function renderPart(
  rows: TimelineRowView[],
  partIndex: number,
  partCount: number,
  config: TimelineConfig,
  layout: HeaderLayout,
  baseHourStartMs: number,
  lines: { cursorX: number | null; nowX: number | null },
  slots: number,
): string {
  const p = palette(config);
  const showTitle = partIndex === 0;
  const showLegend = partIndex === partCount - 1;
  const legendItems: { label: string; color?: string; note?: string }[] = config.markerLegend?.items ?? [
    ...new Set((config.markers ?? []).map((marker) => marker.label)),
  ].map((label) => ({ label }));
  const caption = config.markerLegend?.caption;
  const captionW = caption ? estimateTextWidth(caption, 8) + 8 : 0;
  const legendLayout = layoutLegend(
    legendItems.map((item) => (item.note ? `${item.label} ${item.note}` : item.label)),
    PAD_X + captionW,
    PAD_X + CHART_W,
  );
  const markerRows = legendItems.length ? 1 + Math.max(...legendLayout.map((entry) => entry.row)) : 0;
  const legendH = showLegend ? LEGEND_H + markerRows * LEGEND_ROW_H : 0;
  const rowColors = config.rows.map((row) => config.rowColor?.(row.tz));
  const colors = [
    ...new Set([...rowColors,...(config.markers ?? []).map((m) => m.color), ...legendItems.map((i) => i.color)]),
  ].filter((color): color is string => color !== undefined);
  const classOf = (kind: "mk" | "mt" | "mb" | "mc", color: string | undefined, fallback: string) =>
    color === undefined ? fallback : `${kind}${colors.indexOf(color)}`;
  const title = formatDateLong(config.cursorAt, config.baseTz);
  const chartRight = PAD_X + CHART_W;
  const nowLabelX = lines.nowX === null ? null : Math.min(Math.max(lines.nowX, PAD_X + 6), chartRight - 6);
  const labels = layoutMarkerLabels(config.markers ?? [], baseHourStartMs, nowLabelX, title);
  // Rows of open labels beyond the first push the chart down; the second part has no labels.
  const extraLabelRows = showTitle ? Math.max(0, ...labels.map((label) => label.row)) : 0;
  const labelsBottom = showTitle ? TITLE_H + extraLabelRows * LABEL_PITCH : 0;
  const msToX = (ms: number) => PAD_X + CURSOR_COLUMN * CELL_W + ((ms - baseHourStartMs) / 3_600_000) * CELL_W;
  const bars = showTitle
    ? (config.markers ?? []).flatMap((marker) => {
        const x1 = Math.max(PAD_X, msToX(marker.at));
        const x2 = Math.min(chartRight, msToX(marker.end ?? marker.at));
        return marker.end !== undefined && x2 > x1 ? [{ marker, x1, x2 }] : [];
      })
    : [];
  const barLanes = layoutBarLanes(bars);
  const top = labelsBottom + (bars.length ? (Math.max(...barLanes) + 1) * BAR_PITCH : 0);
  const bottom = TIMELINE_PART_HEIGHT - legendH;
  const metrics = rowMetrics(Math.max(rows.length, slots), top, bottom);

  let markup = svg`<svg xmlns="http://www.w3.org/2000/svg" width="${TIMELINE_WIDTH}" height="${TIMELINE_PART_HEIGHT}" viewBox="0 0 ${TIMELINE_WIDTH} ${TIMELINE_PART_HEIGHT}">`;
  markup += stylesheet(p, colors);
  if (showTitle) markup += text("title", PAD_X, 14, title);

  rows.forEach((row, i) => {
    markup += renderRow(
      row,
      top + i * metrics.height,
      metrics,
      baseHourStartMs,
      config.cursorAt,
      config.nowAt,
      lines,
      config.timeFormat,
      layout,
      config.shade,
      config.showSun ?? true,
      (shade) => (shade === "business" ? classOf("mc", config.rowColor?.(row.tz), shade) : shade),
    );
  });

  // The lines run through both parts, so they read as one line across the gap.
  const lineTop = showTitle ? TITLE_H - 4 : 2;
  const lineBottom = bottom - 2;

  // Opens are drawn under the now and cursor lines, so those two stay readable on top. Each line starts under
  // its own label, and the labels go on top of the lines.
  bars.forEach(({ marker, x1, x2 }, i) => {
    const y = labelsBottom + barLanes[i]! * BAR_PITCH;
    markup += svg`<rect class="${classOf("mb", marker.color, "marker-bar")}" x="${x1}" y="${y}" width="${x2 - x1}" height="${BAR_H}" rx="1.5" fill-opacity="0.75"/>`;
  });
  for (const marker of labels) {
    const y1 = showTitle ? LABEL_BASELINE + marker.row * LABEL_PITCH + 2 : lineTop;
    markup += svg`<line class="${classOf("mk", marker.color, "marker-line")}" x1="${marker.x}" y1="${y1}" x2="${marker.x}" y2="${lineBottom}"/>`;
  }
  if (showTitle) {
    for (const marker of labels) {
      markup += text(classOf("mt", marker.color, "marker-label"), marker.labelX, LABEL_BASELINE + marker.row * LABEL_PITCH, marker.label, {
        attrs: `text-anchor="middle"`,
      });
    }
  }

  if (lines.nowX !== null) {
    markup += svg`<line class="now-line" x1="${lines.nowX}" y1="${lineTop}" x2="${lines.nowX}" y2="${lineBottom}"/>`;
    if (showTitle) {
      markup += text("now-label", nowLabelX ?? lines.nowX, LABEL_BASELINE, "now");
    }
  }
  if (lines.cursorX !== null) {
    markup += svg`<line class="cursor-line" x1="${lines.cursorX}" y1="${lineTop}" x2="${lines.cursorX}" y2="${lineBottom}"/>`;
  }

  if (showLegend) {
    const shadeItems: { shade: Shade; label: string }[] = [
      { shade: "business", label: config.legend?.business ?? "Business" },
    ];
    if (config.legend?.shoulder ?? !config.legend) {
      shadeItems.push({ shade: "shoulder", label: config.legend?.shoulder ?? "Shoulder" });
    }
    shadeItems.push({ shade: "off", label: config.legend?.off ?? "Off" });
    // Tinted cells are explained by the session colours, so only the closed swatch is left to say.
    const shownShades = config.rowColor ? shadeItems.filter((item) => item.shade === "off") : shadeItems;
    const legendTop = bottom + 3;
    let legendX = PAD_X;
    for (const item of shownShades) {
      markup += svg`<rect class="${item.shade}" x="${legendX}" y="${legendTop}" width="10" height="10" rx="2.5"/>`;
      markup += text("legend", legendX + 14, legendTop + 8.5, item.label);
      legendX += 14 + estimateTextWidth(item.label, 8) + 14;
    }
    // One sample per session, under the bands; a long list wraps onto further lines.
    if (caption) markup += text("legend", PAD_X, legendTop + 21.5, caption);
    legendItems.forEach((item, i) => {
      const entry = legendLayout[i]!;
      const y = legendTop + 19 + entry.row * LEGEND_ROW_H;
      markup += svg`<line class="${classOf("mk", item.color, "marker-line")}" x1="${entry.x}" y1="${y}" x2="${entry.x + 10}" y2="${y}"/>`;
      markup += text("legend", entry.x + 14, y + 2.5, entry.text);
    });
  }

  markup += "</svg>";
  return markup;
}

/** The absolute window the chart covers: the cursor's hour start, twelve hours either side. */
export function timelineWindow(cursorAt: number, baseTz: string): { from: number; to: number } {
  const from = localHourStart(cursorAt, baseTz) - CURSOR_COLUMN * 3_600_000;
  return { from, to: from + HOURS_VISIBLE * 3_600_000 };
}

/**
 * The timeline as the images the pane shows: two parts from two locations on, one for a single location. Rows are as tall in both parts. Each part
 * is a complete SVG.
 */
export function generateTimelineParts(config: TimelineConfig): string[] {
  const { cursorAt, nowAt, baseTz } = config;
  const baseHourStartMs = localHourStart(cursorAt, baseTz);
  const baseOffset = zoneOffset(cursorAt, baseTz);

  const rows: TimelineRowView[] = config.rows.map((row) => {
    const offset = zoneOffset(cursorAt, row.tz);
    return {
      tz: row.tz,
      label: row.label,
      cursorOffset: offset,
      deltaMinutes: offset - baseOffset,
      dayDiff: dayDiff(nowAt, row.tz, baseTz),
      isBase: row.isBase ?? false,
      isLocal: row.isLocal ?? false,
      sun: sunTimes(row.coords, localNoon(cursorAt, row.tz), row.tz, config.timeFormat),
      business: row.business,
      shoulder: row.shoulder,
    };
  });

  const msToX = (ms: number) => PAD_X + CURSOR_COLUMN * CELL_W + ((ms - baseHourStartMs) / 3_600_000) * CELL_W;
  const chartRight = PAD_X + CHART_W;
  const nowX = msToX(nowAt) >= PAD_X && msToX(nowAt) <= chartRight ? msToX(nowAt) : null;
  // When the cursor is at the current time, only the "now" line is drawn.
  const cursorX = cursorAt !== nowAt ? msToX(cursorAt) : null;

  const half = Math.ceil(rows.length / 2);
  const chunks = rows.length < 2 ? [rows] : [rows.slice(0, half), rows.slice(half)];
  const layout = headerLayout(rows, config.timeFormat);

  return chunks.map((chunk, index) =>
    renderPart(chunk, index, chunks.length, config, layout, baseHourStartMs, { cursorX, nowX }, half),
  );
}
