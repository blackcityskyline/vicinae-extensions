import assert from "node:assert/strict";

import {
  YAHOO_MAX_AGE_MS,
  chartUrl,
  cryptoIds,
  formatChange,
  formatPrice,
  fxPairs,
  mergeFx,
  parseCrypto,
  parseEcb,
  parseYahooQuotes,
  readCrypto,
  readFx,
  stamp,
  yahooSymbol,
} from "../src/api/quotes.ts";

/**
 * The self-check.
 *
 * Every fixture below is a body recorded from the live endpoint on 2026-11-13; the numbers are
 * asserted by hand from those bodies, not recomputed by the code under test.
 */

const CRYPTO =
  '{"bitcoin":{"usd":70229,"usd_24h_change":-4.800812562297116},"ethereum":{"usd":1989.88,"usd_24h_change":-3.2571407859845714}}';

const ECB =
  '{"amount":1.0,"base":"EUR","date":"2026-11-12","rates":{"AUD":1.6246,"GBP":0.83595,"JPY":176.96,"USD":1.1081}}';

const YAHOO_EURUSD = JSON.stringify({
  chart: {
    result: [
      {
        meta: {
          currency: "USD",
          symbol: "EURUSD=X",
          regularMarketPrice: 1.1063,
          regularMarketChangePercent: 0.0332,
          regularMarketTime: 1794539069,
        },
      },
    ],
  },
});

/** The shorthand Yahoo answers for a USD-based pair: `JPY=X`, not `USDJPY=X`. */
const YAHOO_JPY = JSON.stringify({
  chart: {
    result: [
      {
        meta: {
          currency: "JPY",
          symbol: "JPY=X",
          regularMarketPrice: 159.937,
          regularMarketChangePercent: 0.0594,
          regularMarketTime: 1794539090,
        },
      },
    ],
  },
});

const YAHOO_404 = '{"chart":{"result":null,"error":{"code":"Not Found","description":"No data found, symbol may be delisted"}}}';

let passed = 0;
let failed = 0;

async function check(name: string, body: () => Promise<void> | void): Promise<void> {
  try {
    await body();
    passed += 1;
    console.log(`ok   ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}\n  ${(error as Error).message}`);
  }
}

/** Replaces `fetch` for one check; the extension's calls go through the global. */
async function withFetch<T>(handler: (url: string) => { status: number; body: string }, body: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    const answer = handler(url);
    return {
      ok: answer.status >= 200 && answer.status < 300,
      status: answer.status,
      text: async () => answer.body,
    } as Response;
  }) as typeof fetch;
  try {
    return await body();
  } finally {
    globalThis.fetch = original;
  }
}

async function main() {
  await check("preferences are split into coin ids and BASE/QUOTE pairs, the rest dropped", () => {
    assert.deepEqual(cryptoIds(" bitcoin, Ethereum ,, "), ["bitcoin", "ethereum"]);
    assert.deepEqual(cryptoIds(""), []);
    assert.deepEqual(fxPairs("EUR/USD, eurusd, usd-jpy , EURUSD, XX/YYY"), [
      { base: "EUR", quote: "USD" },
      { base: "EUR", quote: "USD" },
      { base: "USD", quote: "JPY" },
      { base: "EUR", quote: "USD" },
    ]);
    assert.deepEqual(fxPairs(undefined), []);
  });

  await check("a CoinGecko body becomes rows in the configured order, a typo becomes no row", () => {
    const rows = parseCrypto(CRYPTO, ["ethereum", "bitcoin", "solana"], "usd");
    assert.ok(rows);
    assert.equal(rows.length, 2, "solana is not in the body");
    assert.deepEqual(
      rows.map((row) => row.label),
      ["ETH", "BTC"],
      "the configured order, not the response order",
    );
    assert.equal(rows[0]!.price, 1989.88);
    assert.equal(rows[0]!.currency, "USD");
    assert.equal(rows[1]!.price, 70229);
    assert.ok(Math.abs(rows[1]!.change! + 4.800812562297116) < 1e-12);
    assert.deepEqual(parseCrypto("{}", ["notacoin"], "usd"), [], "a mistyped id is a 200 with the coin missing");
    assert.equal(parseCrypto("<html>", ["bitcoin"], "usd"), null);
  });

  await check("ECB rates are crossed locally for every pair", () => {
    const parsed = parseEcb(ECB, [
      { base: "EUR", quote: "USD" },
      { base: "GBP", quote: "USD" },
      { base: "USD", quote: "JPY" },
      { base: "EUR", quote: "XXX" },
    ]);
    assert.ok(parsed);
    assert.equal(parsed.date, "2026-11-12");
    assert.equal(parsed.rows.length, 3, "a currency the ECB has no rate for is left out");
    assert.equal(parsed.rows[0]!.price, 1.1081, "EUR/USD is the USD rate itself");
    assert.ok(Math.abs(parsed.rows[1]!.price - 1.1081 / 0.83595) < 1e-12, "GBP/USD is USD over GBP");
    assert.ok(Math.abs(parsed.rows[2]!.price - 176.96 / 1.1081) < 1e-12, "USD/JPY is JPY over USD");
    assert.equal(parsed.rows[0]!.source, "ECB");
    assert.equal(parsed.rows[0]!.date, "2026-11-12");
    assert.equal(parseEcb("[]", []), null);
  });

  await check("Yahoo quotes are keyed by the requested pair, including the USD shorthand", () => {
    const quotes = parseYahooQuotes([YAHOO_EURUSD, YAHOO_JPY, null, YAHOO_404, "nonsense"], 1_000);
    assert.deepEqual(Object.keys(quotes).sort(), ["EURUSD=X", "USDJPY=X"]);
    assert.equal(quotes["EURUSD=X"]!.price, 1.1063);
    assert.equal(quotes["EURUSD=X"]!.change, 0.0332);
    assert.equal(quotes["EURUSD=X"]!.time, 1_794_539_069_000);
    assert.equal(quotes["USDJPY=X"]!.price, 159.937, "JPY=X is answered under USDJPY=X");
    assert.equal(quotes["USDJPY=X"]!.fetchedAt, 1_000);
  });

  await check("a fresh Yahoo quote wins, a stale or missing one falls back to the ECB", () => {
    const now = 10_000_000_000;
    const pairs = [
      { base: "EUR", quote: "USD" },
      { base: "USD", quote: "JPY" },
      { base: "GBP", quote: "USD" },
      { base: "EUR", quote: "GBP" },
    ];
    const ecb = parseEcb(ECB, pairs)!.rows;
    const quotes = parseYahooQuotes([YAHOO_EURUSD, YAHOO_JPY], now - 60_000);
    const rows = mergeFx(pairs, quotes, ecb, now, YAHOO_MAX_AGE_MS);
    assert.equal(rows.length, 4);
    assert.equal(rows[0]!.source, "Yahoo", "fresh quote");
    assert.equal(rows[0]!.price, 1.1063);
    assert.equal(rows[0]!.at, now - 60_000);
    assert.equal(rows[1]!.source, "Yahoo", "the shorthand is matched back to USD/JPY");
    assert.equal(rows[2]!.source, "ECB", "Yahoo has no GBP/USD quote");
    assert.ok(Math.abs(rows[2]!.price - 1.1081 / 0.83595) < 1e-12);
    assert.equal(rows[3]!.source, "ECB");

    const stale = mergeFx(pairs, parseYahooQuotes([YAHOO_EURUSD], now - YAHOO_MAX_AGE_MS - 1), ecb, now, YAHOO_MAX_AGE_MS);
    assert.equal(stale[0]!.source, "ECB", "a quote older than the window is not shown");
    assert.equal(mergeFx(pairs, {}, [], now, YAHOO_MAX_AGE_MS).length, 0, "no source, no row");
    assert.equal(yahooSymbol({ base: "USD", quote: "JPY" }), "USDJPY=X");
  });

  await check("prices and changes are formatted the way the widget formatted them", () => {
    assert.equal(formatPrice(70229), "70,229");
    assert.equal(formatPrice(1989.88), "1,990");
    assert.equal(formatPrice(159.937), "159.94");
    assert.equal(formatPrice(1.1063), "1.1063");
    assert.equal(formatPrice(0.00001234), "0.00001234");
    assert.equal(formatPrice(Number.NaN), "?");
    assert.equal(formatChange(-4.800812562297116), "▼4.80%");
    assert.equal(formatChange(0.0332), "▲0.03%");
    assert.equal(formatChange(0), "▲0.00%");
    assert.equal(formatChange(undefined), "");
  });

  await check("the subtitle stamp is a clock today and a day and time before", () => {
    const now = new Date(2026, 10, 13, 15, 0, 0).getTime();
    assert.equal(stamp(new Date(2026, 10, 13, 9, 5, 0).getTime(), now), "09:05");
    assert.equal(stamp(new Date(2026, 10, 12, 21, 55, 0).getTime(), now), "Thu 12 21:55");
  });

  await check("the chart link is CoinGecko for a coin and Yahoo for a pair", () => {
    const [btc] = parseCrypto(CRYPTO, ["bitcoin"], "usd")!;
    assert.equal(chartUrl(btc!), "https://www.coingecko.com/en/coins/bitcoin");
    const [eur] = parseEcb(ECB, [{ base: "EUR", quote: "USD" }])!.rows;
    assert.equal(chartUrl(eur!), "https://finance.yahoo.com/quote/EURUSD=X");
  });

  await check("no configured ids means no request at all", async () => {
    let calls = 0;
    await withFetch(
      () => {
        calls += 1;
        return { status: 200, body: "{}" };
      },
      async () => {
        assert.deepEqual(await readCrypto([], "usd"), []);
        assert.deepEqual(await readFx([]), []);
      },
    );
    assert.equal(calls, 0);
  });

  await check("FX reads Yahoo first and takes the ECB when Yahoo has nothing", async () => {
    const pairs = [
      { base: "EUR", quote: "USD" },
      { base: "GBP", quote: "USD" },
    ];
    const yahoo = async (url: string) => {
      if (url.includes("EURUSD=X")) return YAHOO_EURUSD;
      throw new Error("curl: (22) The requested URL returned error: 404");
    };
    await withFetch(
      () => ({ status: 200, body: ECB }),
      async () => {
        const rows = await readFx(pairs, { yahoo });
        assert.equal(rows.length, 2);
        assert.equal(rows[0]!.source, "Yahoo");
        assert.equal(rows[1]!.source, "ECB");
      },
    );
  });

  await check("a dead Yahoo does not take the ECB rows with it, and two dead endpoints are an error", async () => {
    const pairs = [{ base: "EUR", quote: "USD" }];
    const deadYahoo = async () => {
      throw new Error("curl: (7) Failed to connect");
    };
    await withFetch(
      () => ({ status: 200, body: ECB }),
      async () => {
        const rows = await readFx(pairs, { yahoo: deadYahoo });
        assert.equal(rows.length, 1);
        assert.equal(rows[0]!.source, "ECB");
      },
    );
    await withFetch(
      () => ({ status: 503, body: "" }),
      async () => {
        await assert.rejects(() => readFx(pairs, { yahoo: deadYahoo }), /no FX quote/);
      },
    );
  });

  await check("a CoinGecko failure is reported, not silently empty", async () => {
    await withFetch(
      () => ({ status: 429, body: "" }),
      async () => {
        await assert.rejects(() => readCrypto(["bitcoin"], "usd"), /429 from api.coingecko.com/);
      },
    );
  });

  console.log(failed === 0 ? `\nall ${passed} checks passed` : `\n${failed} check(s) failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
