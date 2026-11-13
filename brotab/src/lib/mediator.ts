import { DEFAULT_PORTS, parseTabs, portFor, tabNumber, type Tab } from "./tabs";

/**
 * brotab's mediator, the process the browser extension connects to, serves plain
 * HTTP on loopback: `GET /list_tabs` answers with the same `window.tab \t title
 * \t url` lines `brotab list` prints.
 *
 * Reading it directly is what makes this extension quick: the `brotab` CLI is a
 * Python program that pays a full interpreter start and the `brotab.api` import
 * before it can send the same request.
 */
const PROBE_TIMEOUT_MS = 400;
const REQUEST_TIMEOUT_MS = 3_000;

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

export async function listTabs(ports: number[] = DEFAULT_PORTS): Promise<Tab[]> {
  const alive = await alivePorts(ports);
  if (alive.length === 0) throw new MediatorDownError(ports);

  const listings = await Promise.all(
    alive.map(async (port) => {
      const letter = String.fromCharCode(97 + ports.indexOf(port));
      return parseTabs(await get(`http://127.0.0.1:${port}/list_tabs`, REQUEST_TIMEOUT_MS), letter);
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
