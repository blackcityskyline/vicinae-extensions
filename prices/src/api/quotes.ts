/**
 * The endpoint half of the widget's `Model.js`, without the chart.
 *
 * Three keyless services, measured:
 * CoinGecko for crypto quotes, Yahoo Finance for live FX, and Frankfurter for the ECB's daily
 * reference rates when Yahoo has no quote for a pair. Nothing here imports `@vicinae/api`, so the
 * tests can load it headless.
 */

import { execFile } from "node:child_process";

export type Pair = { base: string; quote: string };

export type Quote = {
  kind: "crypto" | "fx";
  /** `BTC` or `EUR/USD`; the coin id is kept beside it for the chart link. */
  label: string;
  id: string;
  price: number;
  /** The currency the price is in. */
  currency: string;
  /** Percent: 24 h for crypto, the trading day for FX. */
  change?: number;
  source?: "Yahoo" | "ECB";
  /** The ECB fixing date, when the row came from there. */
  date?: string;
  /** When the quote was fetched, for the age in the subtitle. */
  at?: number;
};

/** The handful of CoinGecko ids worth a real ticker; the rest fall back to uppercase. */
const SYMBOLS: Record<string, string> = {
  bitcoin: "BTC",
  ethereum: "ETH",
  solana: "SOL",
  ripple: "XRP",
  cardano: "ADA",
  dogecoin: "DOGE",
  tether: "USDT",
  "usd-coin": "USDC",
  binancecoin: "BNB",
  litecoin: "LTC",
  polkadot: "DOT",
  chainlink: "LINK",
  monero: "XMR",
  tron: "TRX",
};

export const symbolOf = (id: string): string => SYMBOLS[id.toLowerCase()] ?? id.toUpperCase();

export function splitList(value: string | undefined): string[] {
  return String(value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function cryptoIds(value: string | undefined): string[] {
  return splitList(value).map((id) => id.toLowerCase());
}

/** `EUR/USD`, `EURUSD` and `EUR-USD` all read the same; anything else is dropped. */
export function fxPairs(value: string | undefined): Pair[] {
  const pairs: Pair[] = [];
  for (const part of splitList(value)) {
    const match = part.toUpperCase().match(/^([A-Z]{3})\s*[/-]?\s*([A-Z]{3})$/);
    if (match) pairs.push({ base: match[1]!, quote: match[2]! });
  }
  return pairs;
}

/** Thousands separators, and precision that follows the magnitude. */
export function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return "?";
  if (value < 1) return String(Number(value.toPrecision(4)));
  if (value < 1000) return value.toFixed(value >= 100 ? 2 : 4);
  return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** `▲4.80%`, empty when the endpoint sent no change. */
export function formatChange(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "";
  return `${value >= 0 ? "▲" : "▼"}${Math.abs(value).toFixed(2)}%`;
}

export function percent(value: number | undefined): number | undefined {
  return value === undefined || !Number.isFinite(value) ? undefined : value;
}

/** `14:05` for today, `Fri 16 21:55` for anything older. */
export function stamp(ms: number, now = Date.now()): string {
  const date = new Date(ms);
  const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  if (new Date(now).toDateString() === date.toDateString()) return time;
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return `${days[date.getDay()]} ${date.getDate()} ${time}`;
}

/**
 * CoinGecko's `/simple/price` body, in the configured order.
 *
 * A mistyped coin id is a `200` with the coin missing, not an error, so a coin that is absent
 * here is absent on purpose.
 */
export function parseCrypto(raw: string, ids: string[], vsCurrency: string): Quote[] | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const body = data as Record<string, Record<string, unknown> | undefined>;
  const currency = String(vsCurrency || "usd").toLowerCase();
  const rows: Quote[] = [];
  for (const id of ids) {
    const entry = body[id];
    const price = Number(entry?.[currency]);
    if (!entry || !Number.isFinite(price)) continue;
    rows.push({
      kind: "crypto",
      label: symbolOf(id),
      id,
      price,
      currency: currency.toUpperCase(),
      change: percent(Number(entry[`${currency}_24h_change`])),
    });
  }
  return rows;
}

/** Frankfurter's `/v1/latest?base=EUR` body, crossed locally for any pair. */
export function parseEcb(raw: string, pairs: Pair[]): { rows: Quote[]; date: string } | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const body = data as { rates?: Record<string, unknown>; date?: unknown };
  if (!body.rates) return null;
  const rates: Record<string, number> = {};
  for (const [currency, rate] of Object.entries(body.rates)) rates[currency] = Number(rate);
  rates.EUR = 1;
  const date = String(body.date ?? "");
  const rows: Quote[] = [];
  for (const pair of pairs) {
    const base = rates[pair.base] ?? 0;
    const quote = rates[pair.quote] ?? 0;
    if (!Number.isFinite(base) || !Number.isFinite(quote) || base <= 0 || quote <= 0) continue;
    rows.push({
      kind: "fx",
      label: `${pair.base}/${pair.quote}`,
      id: `${pair.base}${pair.quote}`,
      price: quote / base,
      currency: pair.quote,
      source: "ECB",
      date,
    });
  }
  return { rows, date };
}

export const yahooSymbol = (pair: Pair): string => `${pair.base}${pair.quote}=X`;

export type YahooQuote = { price: number; change: number; time: number; fetchedAt: number };

/**
 * Yahoo's chart bodies, one per requested pair, keyed by the symbol Yahoo answered with.
 *
 * A pair Yahoo does not know comes back `404`, so its body is `null` and the pair simply has no
 * quote. A pair starting with USD comes back under the three-letter shorthand — `JPY=X` for
 * `USDJPY=X` — and is put back under the requested name here.
 */
export function parseYahooQuotes(raws: Array<string | null>, fetchedAt: number): Record<string, YahooQuote> {
  const quotes: Record<string, YahooQuote> = {};
  for (const raw of raws) {
    if (!raw) continue;
    let result: Record<string, unknown> | undefined;
    try {
      const body = JSON.parse(raw) as { chart?: { result?: Array<Record<string, unknown>> } };
      result = body.chart?.result?.[0];
    } catch {
      continue;
    }
    const meta = result?.meta as Record<string, unknown> | undefined;
    const price = Number(meta?.regularMarketPrice);
    let symbol = String(meta?.symbol ?? "").toUpperCase();
    if (!symbol || !Number.isFinite(price) || price <= 0) continue;
    if (/^[A-Z]{3}=X$/.test(symbol)) symbol = `USD${symbol}`;
    quotes[symbol] = {
      price,
      change: Number(meta?.regularMarketChangePercent ?? 0),
      time: Number(meta?.regularMarketTime ?? 0) * 1000,
      fetchedAt,
    };
  }
  return quotes;
}

/**
 * One FX row per pair: a Yahoo quote fetched inside `maxAgeMs` wins, the ECB fixing covers the
 * rest, and a pair neither source has is left out.
 */
export function mergeFx(
  pairs: Pair[],
  quotes: Record<string, YahooQuote>,
  ecbRows: Quote[],
  now: number,
  maxAgeMs: number,
): Quote[] {
  const ecb = new Map(ecbRows.map((row) => [row.label, row]));
  const rows: Quote[] = [];
  for (const pair of pairs) {
    const label = `${pair.base}/${pair.quote}`;
    const quote = quotes[yahooSymbol(pair)];
    if (quote && now - quote.fetchedAt <= maxAgeMs) {
      rows.push({
        kind: "fx",
        label,
        id: `${pair.base}${pair.quote}`,
        price: quote.price,
        currency: pair.quote,
        change: percent(quote.change),
        source: "Yahoo",
        at: quote.fetchedAt,
      });
      continue;
    }
    const fallback = ecb.get(label);
    if (fallback) rows.push(fallback);
  }
  return rows;
}

/** A Yahoo quote older than this is not shown at all; the ECB rate takes over. */
export const YAHOO_MAX_AGE_MS = 30 * 60 * 1000;

/**
 * Yahoo's answer depends on the client fingerprint, measured against the same URL:
 *
 * | client | user agent | status |
 * |---|---|---|
 * | `fetch` / `node:https` in the extension | any | 429 |
 * | `curl` | full Chrome string | 429 |
 * | `curl` | `Mozilla/5.0` | 200 |
 *
 * So Yahoo is read through `curl` with the short agent, exactly as the widget did; the other two
 * endpoints answer `fetch` normally.
 */
const CURL_AGENT = "Mozilla/5.0";
function curl(url: string, browserAgent = false): Promise<string> {
  const args = ["-fsS", "--max-time", "10"];
  if (browserAgent) args.push("-A", CURL_AGENT);
  args.push(url);
  return new Promise((resolve, reject) => {
    execFile("curl", args, { encoding: "utf8", maxBuffer: 4 * 1024 * 1024, timeout: 15_000 }, (error, stdout) => {
      if (error) reject(new Error(error.message.split("\n")[0] ?? "curl failed"));
      else resolve(stdout);
    });
  });
}

async function get(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} from ${new URL(url).host}`);
  return response.text();
}

/** `""` when nothing is configured: no request, no rows. */
export async function readCrypto(ids: string[], vsCurrency: string): Promise<Quote[]> {
  if (ids.length === 0) return [];
  const query = new URLSearchParams({
    ids: ids.join(","),
    vs_currencies: vsCurrency.toLowerCase(),
    include_24hr_change: "true",
  });
  const body = await get(`https://api.coingecko.com/api/v3/simple/price?${query.toString()}`);
  const rows = parseCrypto(body, ids, vsCurrency);
  if (!rows) throw new Error("CoinGecko sent something that is not JSON");
  return rows;
}

/** The Yahoo reader is injectable so the tests do not depend on the network or on `curl`. */
export type FxOptions = { yahoo?: (url: string) => Promise<string> };

export async function readFx(pairs: Pair[], options: FxOptions = {}): Promise<Quote[]> {
  if (pairs.length === 0) return [];
  const readYahoo = options.yahoo ?? ((url: string) => curl(url, true));
  const [yahoo, ecb] = await Promise.allSettled([
    (async () => {
      const bodies = await Promise.all(
        pairs.map(async (pair) => {
          try {
            return await readYahoo(
              `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol(pair)}?range=1d&interval=1d`,
            );
          } catch {
            // A pair Yahoo does not know is the ordinary case for its ECB fallback, not an error.
            return null;
          }
        }),
      );
      return parseYahooQuotes(bodies, Date.now());
    })(),
    (async () => {
      const body = await get("https://api.frankfurter.dev/v1/latest?base=EUR");
      const parsed = parseEcb(body, pairs);
      if (!parsed) throw new Error("Frankfurter sent something that is not JSON");
      return parsed.rows;
    })(),
  ]);

  const quotes = yahoo.status === "fulfilled" ? yahoo.value : {};
  const fallback = ecb.status === "fulfilled" ? ecb.value : [];
  const rows = mergeFx(pairs, quotes, fallback, Date.now(), YAHOO_MAX_AGE_MS);
  if (rows.length === 0 && Object.keys(quotes).length === 0 && ecb.status === "rejected") {
    throw new Error(`no FX quote: ${(ecb.reason as Error).message}`);
  }
  return rows;
}

export async function readQuotes(options: {
  cryptoIds: string[];
  vsCurrency: string;
  pairs: Pair[];
}): Promise<{ crypto: Quote[]; fx: Quote[] }> {
  const [crypto, fx] = await Promise.all([
    readCrypto(options.cryptoIds, options.vsCurrency),
    readFx(options.pairs),
  ]);
  return { crypto, fx };
}

/** The public page for a ticker: CoinGecko for a coin, Yahoo Finance for a pair. */
export function chartUrl(quote: Quote): string {
  return quote.kind === "crypto"
    ? `https://www.coingecko.com/en/coins/${encodeURIComponent(quote.id)}`
    : `https://finance.yahoo.com/quote/${quote.id}=X`;
}
