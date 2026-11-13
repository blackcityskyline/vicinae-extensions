# Audit: `prices` ← `omarchy-prices`

[medden/omarchy-prices](https://github.com/medden/omarchy-prices) (MIT, `d980b14`, 2026-10-18) is an
Omarchy bar widget: 253 lines of QML for the pill, 363 for the chart popup, 302 of QML-free
JavaScript in `Model.js`. It has three jobs:

- show FX and crypto tickers in the bar, with the 24h / daily change in the tooltip;
- fall back per FX pair from Yahoo Finance to the European Central Bank's reference rate when
  Yahoo has no quote or its quote is stale;
- draw a 24h / 7d chart of the ticker in a popup.

There is no test suite and no dependency beyond `curl` and three keyless HTTP endpoints. Nothing
needs credentials, so every endpoint below was measured from this machine.

## What maps to what

| Omarchy widget | Here | Why |
| --- | --- | --- |
| bar pill: `BTC 70,229  EUR/USD 1.1063`, one line or rotating | one `List` row per ticker, in two sections: Crypto and FX | a launcher has no bar; the window is the surface |
| tooltip: full price, 24h and day change, source and stamp | the row subtitle: change, source ("Yahoo" / "ECB"), age | a `List` row has one subtitle line |
| tooltip line when a refresh failed: "Last refresh failed; showing previous values" | the section subtitle carries the error; the last values stay on screen | same idea, no tooltip |
| middle click refreshes | `Refresh` (`ctrl+r`) | launcher has no mouse buttons |
| scroll steps through tickers when rotating | **cut** | rotation exists to fit one bar slot; a list shows every ticker at once |
| chart popup, chips, ←/→ and ↑/↓, hover readout, dashed start line | `Open Chart` (`ctrl+o`) opens the ticker's public page in the browser: CoinGecko for crypto, Yahoo Finance for FX | a list cannot draw a line chart; the browser already can, with more than two ranges |
| chart command / `parseChart` / `chartStats` / `nearestIndex` / `staleNote` / `formatChartTime` | **cut** | they exist only to paint that popup |
| `refreshMinutes` (1–120), rotate interval | one fixed 60 s refresh while the window is open | a launcher command cannot poll with the window closed, and 60 s is far inside the free endpoints' limits |
| `omarchy-shell io.github.medden.prices refresh/open/close/toggle` | **cut** | there is no bar to summon |
| settings in `shell.json`: `crypto`, `vsCurrency`, `fxPairs`, `rotateSeconds` | three text preferences: `crypto`, `vsCurrency`, `fxPairs` | same three that change what is read; rotation has nothing to rotate |
| `Model.js` parsing, formatting, source merge | ported to TypeScript, minus the chart half | the parsing is the useful part |

## The endpoints, measured

All three are keyless and CORS-open; all three answered from here on 2026-11-13.

| Thing | Measured |
| --- | --- |
| crypto quotes | `GET https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true` → **200**, `application/json`, 0.32 s. Body: `{"bitcoin":{"usd":70229,"usd_24h_change":-4.8008…},"ethereum":{"usd":1989.88,"usd_24h_change":-3.2571…}}` |
| unknown coin id | same endpoint with `ids=notacoin` → **200** with `{}`. A typo is not an error: the coin is silently absent, so the extension must show no row rather than a failed refresh |
| FX fallback | `GET https://api.frankfurter.dev/v1/latest?base=EUR` → **200**, 0.14 s. `{"amount":1.0,"base":"EUR","date":"2026-11-12","rates":{"AUD":1.6246,…,"GBP":0.83595,…,"JPY":176.96,…}}`. `date` is the last business day, not today; any pair is crossed as `rates[quote]/rates[base]` because `base` itself carries rate 1 |
| FX live | `GET https://query1.finance.yahoo.com/v8/finance/chart/EURUSD=X?range=1d&interval=1d` → **200**, 0.15–0.19 s. `chart.result[0].meta` carries `symbol`, `regularMarketPrice`, `regularMarketChangePercent`, `regularMarketTime` (epoch seconds), `currency`, `exchangeName: "CCY"`, `instrumentType: "CURRENCY"` |
| Yahoo client fingerprint | the same URL, measured in one minute: `curl` without an agent → **429**; `curl -A "Mozilla/5.0"` → **200**; `curl -A "<full Chrome UA>"` → **429**; `fetch` and `node:https` from the extension worker → **429** whatever the agent. The block is the client's TLS/agent pair, not the header alone |
| Yahoo USD shorthand | `USDJPY=X` answers `symbol: "USDJPY=X"`, but `JPY=X` answers the same 159.937 — a pair that starts with USD comes back under the three-letter shorthand. A client matching by requested symbol must normalise `^[A-Z]{3}=X` to `USD…` |
| Yahoo unknown pair | `EURXXX=X` and `XAUUSD=X` → **404** with `{"chart":{"result":null,"error":{"code":"Not Found",…}}}`. With `curl -f` the line is dropped silently, which is exactly the per-pair fallback the widget relies on |
| Yahoo history | `period1/period2&interval=30m` → 242 points for 7 days; `range=1d&interval=1d` → **one** point, so a 24 h line needs `interval=5m` |
| CoinGecko history | `GET /api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=1` → 0.11 s, `{"prices":[[epochMs, price], …]}` at five-minute steps |
| rate limits | neither response carries a rate-limit header. CoinGecko's free tier is documented as per-IP and shared; the extension makes one request per open window per minute at most, which is the widget's own default cadence and far below it |

## Shape

One `view` command, `prices`:

- two sections, **Crypto** and **FX**, each row a ticker: price in its quote currency, the change
  as a coloured tag, and the source plus how old the quote is in the subtitle;
- `Open Chart` (`ctrl+o`) → the CoinGecko coin page or the Yahoo Finance quote page;
- `Copy Price` (`ctrl+c`), `Refresh` (`ctrl+r`);
- the values are read when the window opens and every 60 s while it stays open; the connection to
  the endpoints ends with the request, so nothing runs once the window is closed;
- preferences: `crypto` (CoinGecko ids, comma-separated, empty hides the section),
  `vsCurrency` (default `usd`), `fxPairs` (`BASE/QUOTE`, empty hides the section).

No section is drawn when its preference is empty and there is nothing in it; a window with both
empty says so instead of showing an empty list.

## What is cut, and why

- **The chart popup.** Upstream draws it in QML over 363 lines plus a third of `Model.js`. A list
  cannot draw a line chart, and a browser page for the same ticker is one keystroke away and
  carries more ranges than the widget's two.
- **The bar pill, rotation, scroll and the tooltip.** There is no bar. A list shows every ticker
  simultaneously, which is what rotation existed to work around.
- **`refreshMinutes` as a preference.** The window is open for a minute or two; a fixed 60 s tick
  is simpler than a setting whose whole range is invisible in that time. The upstream default of
  five minutes would show one refresh and then a stale figure.
- **The manual retry timer** (one minute, three attempts) is replaced by the ordinary 60 s tick:
  the next tick is the retry.
- **The Quickshell IPC and the `shell.json` settings path.** A Vicinae command needs neither; the
  preferences are the manifest's.

## Not verified

- The port's checks use fixtures recorded above rather than a second live run.
- The **stale-quote age rule** was not exercised live: every Yahoo answer that arrived at all was
  seconds old. The forced-429 path did exercise the *no quote → ECB* half, which is what a closed
  market or a blocked request produces.
- **CoinGecko's rate limit** was not hit and its exact threshold is not published in the response;
  the extension's one-request-per-minute cadence is the widget's own, so it inherits the same
  headroom rather than measuring it.

## Live launch

`vicinae 'vicinae://launch/@black/prices/prices'`, 2026-11-13:

- the window listed **BTC** and **ETH** from CoinGecko with the 24 h change, and **EUR/USD** and
  **GBP/USD** from Yahoo with the fetch time and the day change; stderr empty, log clean;
- a relaunch while Yahoo answered the worker `429` showed the same two pairs as
  `ECB reference rate · 2026-11-12`, which is the fallback observed rather than only unit-tested;
- fixing the client (curl, short agent) brought the Yahoo rows back on the next launch.

The Yahoo fingerprint measurement above is the reason the request is a `curl` subprocess: Node's
client cannot pass, and the user agent alone does not change that.
