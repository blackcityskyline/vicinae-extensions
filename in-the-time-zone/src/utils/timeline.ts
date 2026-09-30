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

/** Cell the marker is centred on, which is also where the clocks line up. */
const MARKER_CENTRE = MARKER_INDEX * 2 + 1;
const CLOCK_START = MARKER_CENTRE - CLOCK_WIDTH / 2;
const BLOCKS_WIDTH = BLOCKS * 2 + 2;

/**
 * City names are a left column, so an unbounded one would push the clocks out of
 * the block row. Eighteen is the widest that still leaves a gap before cell 21.
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
 * `padEnd` counts UTF-16 code units, which happens to equal the cell count for
 * everything rendered here: the blocks are two units and two cells each, and
 * everything else is BMP one-unit text. A character outside that set would make
 * the padding lie, so `test/timeline.test.ts` measures cells on its own.
 */
export function renderTimeline({ at, zones, base }: TimelineInput): string {
  const rows = zones.map((id) => buildRow(id, at, base));
  if (rows.length === 0) return "```\n```";

  const cityWidth = Math.min(MAX_CITY, Math.max(8, ...rows.map((row) => row.city.length)));

  const body = [`${" ".repeat(MARKER_CENTRE - 3)}▼ NOW ▼`];

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

  return ["```", ...body.map((line) => line.padEnd(BLOCKS_WIDTH)), "```"].join("\n");
}
