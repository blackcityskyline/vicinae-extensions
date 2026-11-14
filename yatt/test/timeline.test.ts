import { describe, expect, it } from "vitest";
import type { HourRange } from "../src/core/types";
import {
  formatDelta,
  formatGmtOffset,
  formatTime,
  formatWeekday,
  resolveTimeFormat,
} from "../src/core/format";
import { localHourStart, localNoon } from "../src/core/time";
import {
  generateTimelineParts,
  TIMELINE_PART_HEIGHT,
  TIMELINE_WIDTH,
  type TimelineRow,
} from "../src/lib/timeline-svg";

/** The instant behind the reference screenshots, and the minute the view folds the clock to. */
const AT = Date.UTC(2026, 3, 9, 1, 39);
const NOW = Date.UTC(2026, 3, 9, 1, 24);
const BASE = "Asia/Tokyo";

const BUSINESS: HourRange = { start: 9, end: 18 };
const SHOULDER: HourRange = { start: 7, end: 21 };

const COORDS = {
  "San Francisco": { lat: 37.74000775, lng: -122.4599777 },
  "New York": { lat: 40.74997906, lng: -73.98001693 },
  London: { lat: 51.49999473, lng: -0.116721844 },
  Paris: { lat: 48.86669293, lng: 2.333335326 },
  Tokyo: { lat: 35.68501691, lng: 139.7514074 },
};

const ROWS: TimelineRow[] = [
  { label: "San Francisco", tz: "America/Los_Angeles", business: BUSINESS, shoulder: SHOULDER, coords: COORDS["San Francisco"] },
  { label: "New York", tz: "America/New_York", business: BUSINESS, shoulder: SHOULDER, coords: COORDS["New York"] },
  { label: "London", tz: "Europe/London", business: BUSINESS, shoulder: SHOULDER, coords: COORDS.London, isLocal: true },
  { label: "Paris", tz: "Europe/Paris", business: BUSINESS, shoulder: SHOULDER, coords: COORDS.Paris },
  // No coordinates: a custom location or a renamed place, which has no sunrise to show.
  { label: "Kuala Lumpur", tz: "Asia/Kuala_Lumpur", business: BUSINESS, shoulder: SHOULDER },
  { label: "Tokyo", tz: "Asia/Tokyo", business: BUSINESS, shoulder: SHOULDER, coords: COORDS.Tokyo, isBase: true },
];

const config = {
  cursorAt: AT,
  nowAt: NOW,
  baseTz: BASE,
  rows: ROWS,
  timeFormat: "12h" as const,
  dark: true,
};

const parts = generateTimelineParts(config);
const svg = parts.join("\n");

const titles = (markup: string) => [...markup.matchAll(/<text class="title"[^>]*>([^<]*)</g)].map((m) => m[1]);
const texts = (markup: string, kind: string) =>
  [...markup.matchAll(new RegExp(`<text class="${kind}[^"]*"[^>]*>([^<]*)<`, "g"))].map((m) => m[1]);
const cells = (markup: string) =>
  [...markup.matchAll(/<rect class="(business|shoulder|off)" x="([\d.]+)"/g)].map((m) => ({
    shade: m[1] ?? "",
    x: Number(m[2]),
  }));

/** The markup between one row's header and the next row's header. */
function rowOf(city: string): string {
  const start = svg.indexOf(`>${city}<`);
  expect(start, `no row for ${city}`).toBeGreaterThanOrEqual(0);
  const names = ROWS.map((r) => r.label).join("|");
  const next = svg.slice(start + 1).search(new RegExp(`>(?:${names})<|class="(?:now|cursor)-line"`));
  return svg.slice(start, next === -1 ? svg.indexOf("</svg>", start) : start + 1 + next);
}

/** The x where the cursor line crosses, and the cell that contains it. */
function cursorCell(row: string): { shade: string; hour: string } {
  const cell = cursorCellAt(row, AT);
  expect(cell, "no cell contains the cursor").toBeDefined();
  const labels = [...row.matchAll(/<text class="hour [a-z-]+-text" x="([\d.]+)"[^>]*>(\d+)</g)].map((m) => ({
    bold: m[0].includes('font-weight="bold"'),
    x: Number(m[1]),
    hour: m[2] ?? "",
  }));
  const bold = labels.find((l) => l.bold && Math.abs(l.x - ((cell?.x ?? 0) + 13)) <= 2);
  return { shade: cell?.shade ?? "", hour: bold?.hour ?? "" };
}

/** The drawn cell for the column the cursor falls in. Cells are shifted 1.5 px in from the chart grid. */
function cursorCellAt(row: string, at: number) {
  const cursorX = 364 + ((at - localHourStart(at, BASE)) / 3_600_000) * 29;
  const raw = 364 + Math.floor((cursorX - 364) / 29) * 29;
  return cells(row).find((c) => Math.abs(c.x - (raw + 1.5)) <= 2);
}

describe("timeline", () => {
  it("is two self-styled svg images whose boxes add up to the pane", () => {
    expect(parts.length).toBe(2);
    expect(TIMELINE_PART_HEIGHT).toBe(174);
    expect(TIMELINE_WIDTH).toBe(728);
    expect(TIMELINE_PART_HEIGHT * 2 + 8).toBe(356);
    for (const part of parts) {
      expect(part).toMatch(
        /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="728" height="174" viewBox="0 0 728 174">/,
      );
      expect(part.match(/<style>/g)?.length).toBe(1);
      expect(part.match(/<\/svg>/g)?.length).toBe(1);
      expect(part).not.toMatch(/NaN|undefined|null/);
    }
    // The date heads the first part, the key of the three bands closes the last.
    expect(titles(parts[0] ?? "").length).toBe(1);
    expect(texts(parts[0] ?? "", "legend").length).toBe(0);
    expect(texts(parts[1] ?? "", "title").length).toBe(0);
    expect(texts(parts[1] ?? "", "legend").length).toBe(3);
  });

  it("titles itself with the base zone's date at the cursor", () => {
    expect(titles(svg)).toEqual(["Thu 9 Apr 2026"]);
  });

  it("gives every row 24 hour cells, spelling the weekday at midnight", () => {
    for (const city of ROWS.map((r) => r.label)) {
      const row = rowOf(city);
      const rowCells = cells(row);
      expect(rowCells.length, `${city} has ${rowCells.length} cells`).toBeGreaterThanOrEqual(23);
      expect(rowCells.length, `${city} has ${rowCells.length} cells`).toBeLessThanOrEqual(25);
      const xs = rowCells.map((c) => c.x);
      expect(Math.min(...xs)).toBeLessThanOrEqual(18);
      // The last cell that fits ends within the chart's 16 px right margin.
      expect(Math.max(...xs) + 26).toBeGreaterThanOrEqual(710);
      expect(texts(row, "weekday").length).toBeLessThanOrEqual(2);
    }
  });

  it("bolds the cursor hour in every row's own local hour grid", () => {
    // The cursor sits at 01:39 UTC: London reads 2 (BST), Tokyo 10 (JST).
    expect(cursorCell(rowOf("London")).hour).toBe("2");
    expect(cursorCell(rowOf("Tokyo")).hour).toBe("10");
    expect(cursorCell(rowOf("San Francisco")).hour).toBe("18");
  });

  it("colours cells by the business and shoulder preferences", () => {
    // London 02:39 is off, Tokyo 10:39 business, Paris 03:39 off, San Francisco 18:39 shoulder,
    // Kuala Lumpur 09:39 business.
    expect(cursorCell(rowOf("London")).shade).toBe("off");
    expect(cursorCell(rowOf("Tokyo")).shade).toBe("business");
    expect(cursorCell(rowOf("Paris")).shade).toBe("off");
    expect(cursorCell(rowOf("San Francisco")).shade).toBe("shoulder");
    expect(cursorCell(rowOf("Kuala Lumpur")).shade).toBe("business");
  });

  it("gives each row its GMT badge and a delta against the base, except the base row", () => {
    const gmts = texts(svg, "badge gmt");
    expect(gmts.length).toBe(ROWS.length);
    expect(gmts).toContain("GMT+9");
    expect(gmts).toContain("GMT-7");
    expect(gmts).toContain("GMT+8");
    expect(new Set(texts(svg, "badge delta"))).toEqual(new Set(["-16 hrs", "-13 hrs", "-8 hrs", "-7 hrs", "-1 hr"]));
    expect(texts(rowOf("Tokyo"), "badge delta").length).toBe(0);
    expect(texts(svg, "badge delta").length + 1).toBe(ROWS.length);
  });

  it("wears the calendar-day difference on the row that is on another date", () => {
    // At now, Tokyo is on 9 April and San Francisco still on 8 April.
    expect(rowOf("San Francisco").match(/class="day-diff"[^>]*>([^<]*)</)?.[1]).toBe("-1");
    expect(rowOf("London")).not.toContain("day-diff");
    expect(rowOf("Tokyo")).not.toContain("day-diff");
  });

  it("shows the current time in the header and the scrubbed time beside the cursor", () => {
    expect(texts(svg, "time")[0]).toBe(formatTime(NOW, "America/Los_Angeles", "12h"));
    expect(svg).toContain(">10:24 AM<");
    expect(texts(rowOf("San Francisco"), "cursor-label")).toEqual(["6:39 PM"]);
    expect(formatWeekday(AT, "Asia/Tokyo")).toBe("Thu");
  });

  it("marks the row in this machine's zone", () => {
    expect(rowOf("London")).toContain(">Local<");
    expect(rowOf("Tokyo")).not.toContain(">Local<");
  });

  it("draws sunrise and sunset, and dashes where there is no place", () => {
    expect(texts(rowOf("Tokyo"), "sun")).toEqual(["5:18 AM", "6:09 PM"]);
    expect(texts(rowOf("Kuala Lumpur"), "sun")).toEqual(["—", "—"]);
    expect(texts(rowOf("Paris"), "sun").filter((v) => v !== "")).toHaveLength(2);
  });

  it("draws the now line in both parts, the cursor line only when scrubbed", () => {
    expect(svg.match(/class="now-line"/g)?.length).toBe(parts.length);
    expect(svg).toContain(">now<");
    expect(svg.match(/class="cursor-line"/g)?.length).toBe(parts.length);
    const unscrubbed = generateTimelineParts({ ...config, cursorAt: NOW }).join("\n");
    expect(unscrubbed.match(/class="cursor-line"/g)).toBeNull();
  });

  it("spells the three bands in the legend", () => {
    expect(texts(svg, "legend")).toEqual(["Business", "Shoulder", "Off"]);
  });

  it("moves the cells, not the hour numbers, when the cursor is scrubbed", () => {
    const at = AT + 90 * 60_000;
    const later = generateTimelineParts({ ...config, cursorAt: at }).join("\n");
    const start = later.indexOf(">Tokyo<");
    const row = later.slice(start, later.indexOf("</svg>", start));
    const cell = cursorCellAt(row, at);
    expect(cell?.x).toBeCloseTo(365.5, 1);
    expect(cell?.shade).toBe("business");
  });

  it("renders one row and no rows", () => {
    const one = generateTimelineParts({ ...config, rows: [ROWS[5]] }).join("\n");
    expect(one).toContain(">Tokyo<");
    const none = generateTimelineParts({ ...config, rows: [] }).join("\n");
    expect(none).not.toMatch(/class="hour/);
  });

  it("honours the hour colour overrides", () => {
    const tinted = generateTimelineParts({
      ...config,
      colors: { business: "#123456" },
    }).join("");
    expect(tinted).toContain(".business { fill: #123456; }");
  });
});

describe("timeline helpers", () => {
  it("resolves the clock preference, including the system's own habit", () => {
    expect(resolveTimeFormat("24h")).toBe("24h");
    expect(resolveTimeFormat("12h")).toBe("12h");
    expect(["12h", "24h"]).toContain(resolveTimeFormat("system"));
    expect(formatTime(AT, "Europe/London", "24h")).toBe("02:39");
    expect(formatTime(AT, "Europe/London", "12h")).toBe("2:39 AM");
  });

  it("formats GMT offsets and deltas", () => {
    expect(formatGmtOffset(0)).toBe("GMT+0");
    expect(formatGmtOffset(330)).toBe("GMT+5:30");
    expect(formatGmtOffset(-420)).toBe("GMT-7");
    expect(formatGmtOffset(345)).toBe("GMT+5:45");
    expect(formatDelta(0)).toBe("same");
    expect(formatDelta(60)).toBe("+1 hr");
    expect(formatDelta(-120)).toBe("-2 hrs");
    expect(formatDelta(-570)).toBe("-9h 30m");
  });

  it("reads the sun at the place's local noon, not at the cursor", () => {
    // Kolkata is 5:30 east of UTC, so its noon is 06:30 UTC.
    const noon = localNoon(AT, "Asia/Kolkata");
    expect(formatTime(noon, "Asia/Kolkata", "24h")).toBe("12:00");
    expect(new Date(noon).toISOString()).toBe("2026-04-09T06:30:00.000Z");
    expect(localHourStart(AT, "Asia/Tokyo")).toBe(Date.UTC(2026, 3, 9, 1, 0));
  });
});
