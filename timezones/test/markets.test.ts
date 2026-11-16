import { describe, expect, it } from "vitest";
import {
  SESSIONS,
  isOpenAt,
  markersBetween,
  nextOpen,
  regionFor,
  sessionOn,
  sessionState,
  sessionWindows,
  type Session,
} from "../src/lib/markets";

const byId = (id: string): Session => {
  const s = SESSIONS.find((x) => x.id === id);
  if (!s) throw new Error(`no session ${id}`);
  return s;
};

const nyse = byId("nyse-open");
const cme = byId("cme-open");
const londonOpen = byId("london-open");
const londonSession = byId("london-session");

describe("market sessions", () => {
  it("opens at the exchange's local hour, UTC-5 in winter and UTC-4 in summer", () => {
    // NYSE is 09:30 in New York. January is EST, July is EDT: the local hour never moves.
    expect(sessionOn(nyse, Date.UTC(2026, 0, 15, 12, 0))?.start).toBe(Date.UTC(2026, 0, 15, 14, 30));
    expect(sessionOn(nyse, Date.UTC(2026, 6, 16, 12, 0))?.start).toBe(Date.UTC(2026, 6, 16, 13, 30));
    expect(sessionOn(nyse, Date.UTC(2026, 0, 15, 12, 0))?.close).toBe(Date.UTC(2026, 0, 15, 21, 0));
  });

  it("follows the daylight-saving transitions on both sides", () => {
    // US DST starts Sunday 8 March and ends Sunday 1 November 2026; Monday's open follows.
    expect(sessionOn(nyse, Date.UTC(2026, 2, 9, 12, 0))?.start).toBe(Date.UTC(2026, 2, 9, 13, 30));
    expect(sessionOn(nyse, Date.UTC(2026, 10, 2, 12, 0))?.start).toBe(Date.UTC(2026, 10, 2, 14, 30));
  });

  it("skips weekends and opens on the next trading day", () => {
    const from = Date.UTC(2026, 0, 17, 12, 0); // Saturday
    expect(nextOpen(nyse, from).start).toBe(Date.UTC(2026, 0, 19, 14, 30));
    expect(nextOpen(londonOpen, from).start).toBe(Date.UTC(2026, 0, 19, 8, 0));
  });

  it("opens London at 08:00 local, GMT in winter and BST in summer", () => {
    expect(sessionOn(londonOpen, Date.UTC(2026, 0, 15, 12, 0))?.start).toBe(Date.UTC(2026, 0, 15, 8, 0));
    expect(sessionOn(londonOpen, Date.UTC(2026, 6, 16, 12, 0))?.start).toBe(Date.UTC(2026, 6, 16, 7, 0));
    expect(sessionOn(londonSession, Date.UTC(2026, 6, 16, 12, 0))?.close).toBe(Date.UTC(2026, 6, 16, 16, 0));
  });

  it("treats an open session as open and looks past its close", () => {
    expect(sessionState(nyse, Date.UTC(2026, 0, 15, 15, 0)).isOpen).toBe(true);
    const after = sessionState(nyse, Date.UTC(2026, 0, 15, 21, 30));
    expect(after.isOpen).toBe(false);
    expect(after.open.start).toBe(Date.UTC(2026, 0, 16, 14, 30));
  });

  it("runs CME overnight from Sunday 17:00 to Monday 16:00, and closes for the daily break", () => {
    const from = Date.UTC(2026, 0, 17, 12, 0); // Saturday
    const next = nextOpen(cme, from);
    expect(next.start).toBe(Date.UTC(2026, 0, 18, 23, 0)); // Sunday 17:00 CST
    expect(next.close).toBe(Date.UTC(2026, 0, 19, 22, 0)); // Monday 16:00 CST

    // Monday morning still belongs to the session that opened on Sunday.
    const running = sessionState(cme, Date.UTC(2026, 0, 19, 12, 0));
    expect(running.isOpen).toBe(true);
    expect(running.open.start).toBe(Date.UTC(2026, 0, 18, 23, 0));

    const breakTime = sessionState(cme, Date.UTC(2026, 0, 19, 22, 30)); // Monday 16:30 CST
    expect(breakTime.isOpen).toBe(false);
    expect(breakTime.open.start).toBe(Date.UTC(2026, 0, 19, 23, 0));
  });

  it("closes CME Globex from Friday 16:00 to Sunday 17:00 Chicago time", () => {
    // January is CST, UTC-6. The Friday session ends at 16:00 CST and nothing opens that evening.
    expect(isOpenAt(cme, Date.UTC(2026, 0, 16, 21, 0))).toBe(true); // Fri 15:00 CST, Thursday's session still running
    expect(isOpenAt(cme, Date.UTC(2026, 0, 16, 23, 30))).toBe(false); // Fri 17:30 CST
    expect(isOpenAt(cme, Date.UTC(2026, 0, 17, 16, 0))).toBe(false); // Sat 10:00 CST
    expect(isOpenAt(cme, Date.UTC(2026, 0, 18, 22, 0))).toBe(false); // Sun 16:00 CST
    expect(isOpenAt(cme, Date.UTC(2026, 0, 18, 23, 30))).toBe(true); // Sun 17:30 CST
    expect(nextOpen(cme, Date.UTC(2026, 0, 16, 22, 30)).start).toBe(Date.UTC(2026, 0, 18, 23, 0));
  });

  it("closes the Tokyo cash market over lunch and splits its day in two", () => {
    const tse = byId("tokyo-exchange");
    // 09:00–11:30 and 12:30–15:30 JST; UTC is nine hours behind in winter.
    expect(isOpenAt(tse, Date.UTC(2026, 0, 15, 1, 0))).toBe(true); // 10:00 JST
    expect(isOpenAt(tse, Date.UTC(2026, 0, 15, 3, 0))).toBe(false); // 12:00 JST, lunch
    expect(isOpenAt(tse, Date.UTC(2026, 0, 15, 4, 0))).toBe(true); // 13:00 JST
    expect(isOpenAt(tse, Date.UTC(2026, 0, 15, 6, 30))).toBe(false); // 15:30 JST, closed
    expect(sessionWindows(tse, Date.UTC(2026, 0, 15, 0, 0), Date.UTC(2026, 0, 16, 0, 0))).toEqual([
      { start: Date.UTC(2026, 0, 15, 0, 0), end: Date.UTC(2026, 0, 15, 2, 30) },
      { start: Date.UTC(2026, 0, 15, 3, 30), end: Date.UTC(2026, 0, 15, 6, 30) },
    ]);
  });

  it("gives a zone the market it actually trades, and none to a zone it does not know", () => {
    expect(regionFor("Asia/Tokyo")?.market.id).toBe("tokyo-exchange");
    expect(regionFor("Europe/London")?.market.id).toBe("london-open");
    expect(regionFor("UTC")?.market.id).toBe("london-open");
    expect(regionFor("Europe/Berlin")?.market.id).toBe("frankfurt-open");
    expect(regionFor("America/New_York")?.market.id).toBe("nyse-open");
    expect(regionFor("America/Los_Angeles")?.session.id).toBe("new-york-session");
    expect(regionFor("Australia/Sydney")).toBeUndefined();
  });

  it("gives every market its own open, Frankfurt and London in the same minute included", () => {
    const from = Date.UTC(2026, 0, 15, 0, 0);
    const markers = markersBetween(from, from + 86_400_000);
    // January: Frankfurt 09:00 CET and London 08:00 GMT are both 08:00 UTC, so they sit on one instant but stay
    // two entries, each with its own label.
    expect(markers).toEqual([
      { at: Date.UTC(2026, 0, 15, 0, 0), label: "Asia" }, // 09:00 Tokyo
      { at: Date.UTC(2026, 0, 15, 8, 0), label: "Frankfurt" },
      { at: Date.UTC(2026, 0, 15, 8, 0), label: "London" },
      { at: Date.UTC(2026, 0, 15, 13, 0), label: "New York" }, // 08:00 forex session
      { at: Date.UTC(2026, 0, 15, 14, 30), label: "NYSE" }, // 09:30
      { at: Date.UTC(2026, 0, 15, 23, 0), label: "CME" }, // 17:00 Chicago
    ]);
  });

  it("keeps Frankfurt with London and CME apart from NYSE through every daylight-saving mismatch", () => {
    const labelsAt = (y: number, m: number, d: number) => {
      const from = Date.UTC(y, m, d);
      return Object.fromEntries(markersBetween(from, from + 86_400_000).map((x) => [x.label, x.at - from]));
    };
    const hours = (n: number) => n * 3_600_000;
    // 18 March: the US is on summer time, Europe still on winter time.
    const march = labelsAt(2026, 2, 18);
    expect(march.Frankfurt).toBe(hours(8));
    expect(march.London).toBe(hours(8));
    expect(march.NYSE).toBe(hours(13.5));
    expect(march.CME).toBe(hours(22));
    // 16 July: both on summer time.
    const july = labelsAt(2026, 6, 16);
    expect(july.Frankfurt).toBe(hours(7));
    expect(july.London).toBe(hours(7));
    expect(july.NYSE).toBe(hours(13.5));
    expect(july.CME).toBe(hours(22));
    // 28 October: Europe is back on winter time, the US not yet.
    const october = labelsAt(2026, 9, 28);
    expect(october.Frankfurt).toBe(hours(8));
    expect(october.NYSE).toBe(hours(13.5));
    // CME and NYSE never share a minute, and every label is its own entry.
    for (const day of [march, july, october]) expect(day.CME).not.toBe(day.NYSE);
  });

  it("has no CME open on Friday evening or Saturday, and only CME on Sunday", () => {
    const day = (d: number) => markersBetween(Date.UTC(2026, 0, d), Date.UTC(2026, 0, d + 1)).map((m) => m.label);
    expect(day(16)).not.toContain("CME"); // Friday
    expect(day(17)).toEqual([]); // Saturday
    expect(day(18)).toEqual(["CME"]); // Sunday: 17:00 Chicago is 23:00 UTC
    expect(day(19)).toContain("CME"); // Monday
  });
});
