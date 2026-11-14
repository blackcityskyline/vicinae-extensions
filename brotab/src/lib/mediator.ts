import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { cacheDir } from "~/lib/browser";
import { DEFAULT_PORTS, parseTabs, portFor, tabNumber, type Tab } from "./tabs";

/**
 * brotab's mediator, the process the browser extension connects to, serves plain
 * HTTP on loopback: `GET /list_tabs` answers with the same `window.tab \t title
 * \t url` lines `brotab list` prints.
 *
 * Reading it directly is what makes this extension quick: the `brotab` CLI is a
 * Python program that pays a full interpreter start and the `brotab.api` import
 * before it can send the same request, and the `brotab-ng` CLI paid a Node start
 * for the same HTTP call.
 */
const PROBE_TIMEOUT_MS = 400;
const REQUEST_TIMEOUT_MS = 3_000;
/** The add-on selects, waits for a paint and captures; a cold tab takes a second. */
const SCREENSHOT_TIMEOUT_MS = 30_000;

export class MediatorDownError extends Error {
  constructor(public readonly ports: number[]) {
    super(`No brotab mediator answered on ports ${ports[0]}–${ports[ports.length - 1]}. Start your browser.`);
    this.name = "MediatorDownError";
  }
}

async function get(url: string, timeoutMs: number): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.text();
}

/** Every port that runs a mediator, in brotab's own order. */
async function alivePorts(ports: number[]): Promise<number[]> {
  const probes = ports.map(async (port) => {
    try {
      await get(`http://127.0.0.1:${port}/get_pid`, PROBE_TIMEOUT_MS);
      return port;
    } catch {
      return null;
    }
  });

  return (await Promise.all(probes)).filter((port): port is number => port !== null);
}

/**
 * `query_tabs` takes the Chrome-style queryInfo as URL-safe base64, padding
 * included: the add-on decodes it with `atob`, which rejects a padded-off string.
 */
function padded(value: string): string {
  const base = Buffer.from(value).toString("base64url");
  return base + "=".repeat((4 - (base.length % 4)) % 4);
}

function encodeQuery(query: Record<string, unknown>): string {
  return padded(JSON.stringify(query));
}

/**
 * The add-on reports only `window.tab \t title \t url`, so a tab's own state is
 * not in the line. It can filter by it, though: this asks for the discarded ones
 * (unloaded from memory, still in the tab strip) and returns their ids.
 *
 * Firefox exposes `discarded` in `tabs.query`; measured on Zen, `{"discarded":
 * true}` returned exactly the 12 unloaded tabs and `{"discarded": false}` the
 * loaded one.
 */
async function discardedIds(port: number, letter: string): Promise<Set<string>> {
  const lines = await get(
    `http://127.0.0.1:${port}/query_tabs/${encodeQuery({ discarded: true })}`,
    REQUEST_TIMEOUT_MS,
  );
  return new Set(parseTabs(lines, letter).map((tab) => tab.id));
}

export async function listTabs(ports: number[] = DEFAULT_PORTS): Promise<Tab[]> {
  const alive = await alivePorts(ports);
  if (alive.length === 0) throw new MediatorDownError(ports);

  const listings = await Promise.all(
    alive.map(async (port) => {
      const letter = String.fromCharCode(97 + ports.indexOf(port));
      const [lines, discarded] = await Promise.all([
        get(`http://127.0.0.1:${port}/list_tabs`, REQUEST_TIMEOUT_MS),
        // A mark is worth less than the list: if this fails, show the list unmarked.
        discardedIds(port, letter).catch(() => new Set<string>()),
      ]);

      return parseTabs(lines, letter).map((tab) => ({ ...tab, unloaded: discarded.has(tab.id) }));
    }),
  );

  return listings.flat();
}

export async function activateTab(id: string, ports: number[] = DEFAULT_PORTS): Promise<void> {
  await get(`http://127.0.0.1:${portFor(id, ports)}/activate_tab/${numericTab(id)}?focused=1`, REQUEST_TIMEOUT_MS);
}

export async function closeTab(id: string, ports: number[] = DEFAULT_PORTS): Promise<void> {
  await get(`http://127.0.0.1:${portFor(id, ports)}/close_tabs/${numericTab(id)}`, REQUEST_TIMEOUT_MS);
}

export type Screenshot = {
  /** The PNG written to the cache directory. */
  file: string;
  tab: number;
  window: number;
  bytes: number;
};

/**
 * `captureVisibleTab` only sees the selected tab of a window, so the add-on
 * selects the tab, waits for it to paint, captures and puts the previous
 * selection back. The JSON answer carries the PNG as a data URL.
 */
export async function screenshot(tabId: string, ports: number[] = DEFAULT_PORTS): Promise<Screenshot> {
  const port = ports[tabId.charCodeAt(0) - 97];
  if (port === undefined) throw new Error(`brotab tab id "${tabId}" carries no mediator letter`);

  const body = await get(`http://127.0.0.1:${port}/screenshot/${numericTab(tabId)}`, SCREENSHOT_TIMEOUT_MS);
  const answer = JSON.parse(body) as { data?: string; error?: string; tab?: number; window?: number };
  if (!answer.data) throw new Error(answer.error ?? "the add-on returned no screenshot");

  const data = Buffer.from(answer.data.replace(/^data:image\/png;base64,/, ""), "base64");
  const file = join(cacheDir(), "screenshots", `${tabId.replace(/\./g, "-")}-${Date.now()}.png`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, data);

  return { file, tab: answer.tab ?? 0, window: answer.window ?? 0, bytes: data.length };
}

async function oneAlive(ports: number[]): Promise<number> {
  const alive = await alivePorts(ports);
  const port = alive[0];
  if (port === undefined) throw new MediatorDownError(ports);
  return port;
}

/**
 * History and browsing data are the browser's own data: it keeps an exclusive
 * lock on `places.sqlite` and `cookies.sqlite`, so an outside process cannot
 * change them. These routes go to the add-on, which lives inside the browser.
 */
export async function deleteHistoryUrl(url: string, ports: number[] = DEFAULT_PORTS): Promise<void> {
  const port = await oneAlive(ports);
  await get(`http://127.0.0.1:${port}/delete_history_url/${padded(url)}`, REQUEST_TIMEOUT_MS);
}

export async function deleteHistoryRange(start: number, end: number, ports: number[] = DEFAULT_PORTS): Promise<void> {
  const port = await oneAlive(ports);
  await get(`http://127.0.0.1:${port}/delete_history_range/${Math.round(start)}/${Math.round(end)}`, REQUEST_TIMEOUT_MS);
}

export async function clearBrowsingData(
  since: number,
  data: { cookies: boolean; cache: boolean },
  ports: number[] = DEFAULT_PORTS,
): Promise<void> {
  const port = await oneAlive(ports);
  const query = `since=${Math.max(0, Math.round(since))}&cookies=${data.cookies ? 1 : 0}&cache=${data.cache ? 1 : 0}`;
  await get(`http://127.0.0.1:${port}/clear_browsing_data?${query}`, REQUEST_TIMEOUT_MS);
}

/**
 * The mediator calls `int()` on the tab and shuts itself down when that raises,
 * so a malformed id must never reach it. Measured: `/close_tabs/1.17` killed a
 * running mediator and the browser did not start another one.
 */
function numericTab(id: string): string {
  const tab = tabNumber(id);
  if (!/^\d+$/.test(tab)) throw new Error(`brotab tab id "${id}" carries no numeric tab`);
  return tab;
}

/** A port that is not running a mediator is not a failure worth a toast. */
export function describeError(error: unknown): string {
  if (error instanceof MediatorDownError) return "brotab's mediator is not running. Start your browser so its brotab extension can connect.";
  return error instanceof Error ? error.message : String(error);
}
