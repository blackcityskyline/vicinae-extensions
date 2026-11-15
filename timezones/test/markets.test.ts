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

  it("marks every open once, and puts the European opens on one line", () => {
    const from = Date.UTC(2026, 0, 15, 0, 0);
    const to = Date.UTC(2026, 0, 16, 0, 0);
    const markers = markersBetween(from, to);
    expect(markers.map((m) => m.at)).toEqual([
      Date.UTC(2026, 0, 15, 0, 0), // 09:00 Tokyo, Asian session
      Date.UTC(2026, 0, 15, 8, 0), // FTSE, LSE, Frankfurt and London, all at once
      Date.UTC(2026, 0, 15, 13, 0), // 08:00 New York, forex session
      Date.UTC(2026, 0, 15, 14, 30), // 09:30 New York, NYSE
      Date.UTC(2026, 0, 15, 23, 0), // 17:00 Chicago, CME
    ]);
    expect(markers[1]?.label).toBe("FTSE · LSE · Frankfurt · London");
    expect(markers[0]?.label).toBe("Asia");
  });
});
