import { CLOCK_WIDTH, dayShift, formatDelta, hourKind, offsetMinutes, zoneClock, zoneParts } from "~/utils/time";
import { parseZone } from "~/utils/zones";

export type TimelineInput = {
  at: Date;
  /** Zone ids, in display order. */
  zones: string[];
  /** A zone id. The row that matches it is the base and reports no delta. */
  base: string;
};

const BLOCKS = 24;
const MARKER_INDEX = 12;

/**
 * Cells, not code units: the label's indent is a wide space, one unit and two
 * cells. Everything else on a line is BMP text or an emoji, where the two happen
 * to agree, which is why the rows can still be padded by unit count.
 */
function cells(line: string): number {
  let total = 0;
  for (const character of line) {
    const code = character.codePointAt(0) ?? 0;
    total += code > 0x1f000 || code === 0x3000 ? 2 : 1;
  }
  return total;
}

/**
 * Advances measured in the launcher's pane on 2026-11-12: a text cell is 9 px and
 * an emoji block 15.65 px, so the bar is 13% narrower than its two-cells-per-block
 * markup. A clock placed by cell count drifts right of the marker it belongs to;
 * this places it by pixels instead, centred on the marked block.
 */
const TEXT_ADVANCE = 9;
const EMOJI_ADVANCE = 15.65;

/** Text cell the eight-wide clock starts on, so the clock is centred on the marker. */
const CLOCK_START = Math.round(
  ((MARKER_INDEX + 0.5) * EMOJI_ADVANCE - (CLOCK_WIDTH * TEXT_ADVANCE) / 2) / TEXT_ADVANCE,
);
const BLOCKS_WIDTH = BLOCKS * 2 + 2;

/**
 * City names are a left column, so an unbounded one would push the clocks out of
 * the block row. Eighteen is the widest that still leaves a gap before the clock.
 */
const MAX_CITY = 18;

const BLOCK_CHARS = { work: "🟩", sleep: "🟥", marginal: "🟨" } as const;

type Row = {
  city: string;
  clock: string;
  day: string;
  /** Signed distance from the base, or "(base)". Never the GMT offset. */
  delta: string;
  blocks: string;
};

function blocksFor(localHour: number): string {
  let row = "";
  for (let index = 0; index < BLOCKS; index++) {
    const hour = (((localHour + index - MARKER_INDEX) % 24) + 24) % 24;
    const block = BLOCK_CHARS[hourKind(hour)];
    row += index === MARKER_INDEX ? `|${block}|` : block;
  }
  return row;
}

function buildRow(id: string, at: Date, base: string): Row {
  const { zone, city } = parseZone(id);
  const isBase = zone === base;

  return {
    city,
    clock: zoneClock(zone, at),
    day: isBase ? "" : dayShift(zone, base, at),
    delta: isBase ? "(base)" : formatDelta(offsetMinutes(zone, at) - offsetMinutes(base, at), "text"),
    blocks: blocksFor(zoneParts(zone, at).hour),
  };
}

/**
 * The compact timeline: one day per city as a row of hour blocks with a marker
 * on the current hour, and a label above it.
 *
 * Every line is exactly as wide as the bar and no wider. Upstream lays the
 * label out independently of the blocks and its own screenshots show the longest
 * city name wrapping onto a second line inside the code block; at a narrower
 * window its GMT and delta columns fall off the right edge instead, which is
 * what happened here. The GMT offset moved to the metadata panel, where there is
 * room for it, and only the signed delta stays on the line.
 *
 * Padding counts UTF-16 code units on the rows and cells on everything, because
 * the label's indent is a wide space (one unit, two cells). `test/timeline.test.ts`
 * measures cells on its own.
 */
export function renderTimeline({ at, zones, base }: TimelineInput): string {
  const rows = zones.map((id) => buildRow(id, at, base));
  if (rows.length === 0) return "```\n```";

  const cityWidth = Math.min(MAX_CITY, Math.max(8, ...rows.map((row) => row.city.length)));

  // Measured 2026-11-12 in Vicinae's pane: an emoji block advances 15.65 px and a
  // text cell 9 px, so the bar is 13% narrower than its 48 characters and a
  // space-indented label lands two blocks right of the marker by mid-bar. The
  // indent uses wide (U+3000) cells, which advance like an emoji, so the label
  // follows the bar; it is the marker's left edge minus the label's own half.
  const body = [`${"\u3000".repeat(MARKER_INDEX - 2)} ▼ NOW ▼`];

  for (const row of rows) {
    const name = row.city.length > cityWidth ? `${row.city.slice(0, cityWidth - 1)}…` : row.city.padEnd(cityWidth);
    const labelEnd = CLOCK_START + CLOCK_WIDTH + row.day.length;
    // The delta hangs off the right edge of the bar, never past it: the bar is
    // the widest thing on the line, and anything to its right is clipped by the
    // panel rather than wrapped.
    const deltaStart = BLOCKS_WIDTH - row.delta.length;

    body.push(
      name +
        " ".repeat(Math.max(2, CLOCK_START - cityWidth)) +
        row.clock.padStart(CLOCK_WIDTH) +
        row.day +
        " ".repeat(Math.max(2, deltaStart - labelEnd)) +
        row.delta,
    );
    body.push(row.blocks);
  }

  return ["```", ...body.map((line) => line + " ".repeat(Math.max(0, BLOCKS_WIDTH - cells(line)))), "```"].join("\n");
}
