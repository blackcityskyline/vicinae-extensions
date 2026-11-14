# Audit: `prices` ← `omarchy-prices`

[medden/omarchy-prices](https://github.com/medden/omarchy-prices) (MIT,
`d980b14`, 2026-10-18) is an Omarchy bar widget: 253 lines of QML for the pill,
363 for the chart popup, 302 of QML-free JavaScript in `Model.js`. It shows FX
and crypto tickers with the 24h / daily change, falls back per FX pair from Yahoo
Finance to the ECB reference rate, and draws a 24h / 7d chart in a popup.

No test suite; no dependency beyond `curl` and three keyless endpoints, all
measured from this machine.

## What maps to what

| Omarchy widget | Here | Why |
| --- | --- | --- |
| bar pill: `BTC 70,229  EUR/USD 1.1063`, one line or rotating | one `List` row per ticker, in two sections: Crypto and FX | a launcher has no bar |
| tooltip: full price, 24h and day change, source and stamp | the row subtitle: change, source ("Yahoo" / "ECB"), age | a `List` row has one subtitle line |
| tooltip line when a refresh failed | the section subtitle carries the error; the last values stay | same idea, no tooltip |
| middle click refreshes | `Refresh` (`ctrl+r`) | launcher has no mouse buttons |
| scroll steps through tickers | **cut** | rotation only fits one bar slot; a list shows every ticker |
| chart popup, chips, ←/→ and ↑/↓, hover readout, dashed start line | `Open Chart` (`ctrl+o`) opens CoinGecko for crypto or Yahoo for FX | a list cannot draw a chart; the browser has more ranges |
| chart command / `parseChart` / `chartStats` / `nearestIndex` / `staleNote` / `formatChartTime` | **cut** | they only paint that popup |
| `refreshMinutes` (1–120), rotate interval | one fixed 60 s refresh while open | no polling with the window closed; 60 s is inside the endpoints' limits |
| `omarchy-shell io.github.medden.prices refresh/open/close/toggle` | **cut** | no bar to summon |
| settings in `shell.json`: `crypto`, `vsCurrency`, `fxPairs`, `rotateSeconds` | three text preferences: `crypto`, `vsCurrency`, `fxPairs` | rotation has nothing to rotate |
| `Model.js` parsing, formatting, source merge | ported to TypeScript, minus the chart half | the parsing is the useful part |

## The endpoints, measured

All keyless and CORS-open; all answered from here on 2026-11-13.

| Thing | Measured |
| --- | --- |
| crypto quotes | `GET https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true` → **200**, `application/json`, 0.32 s. Body: `{"bitcoin":{"usd":70229,"usd_24h_change":-4.8008…},"ethereum":{"usd":1989.88,"usd_24h_change":-3.2571…}}` |
| unknown coin id | same endpoint with `ids=notacoin` → **200** with `{}`. A typo is not an error, so the extension shows no row rather than a failed refresh |
| FX fallback | `GET https://api.frankfurter.dev/v1/latest?base=EUR` → **200**, 0.14 s. `{"amount":1.0,"base":"EUR","date":"2026-11-12","rates":{"AUD":1.6246,…,"GBP":0.83595,…,"JPY":176.96,…}}`. `date` is the last business day; any pair is crossed as `rates[quote]/rates[base]` |
| FX live | `GET https://query1.finance.yahoo.com/v8/finance/chart/EURUSD=X?range=1d&interval=1d` → **200**, 0.15–0.19 s. `chart.result[0].meta` carries `symbol`, `regularMarketPrice`, `regularMarketChangePercent`, `regularMarketTime` (epoch seconds), `currency`, `exchangeName: "CCY"`, `instrumentType: "CURRENCY"` |
| Yahoo client fingerprint | the same URL in one minute: `curl` without an agent → **429**; `curl -A "Mozilla/5.0"` → **200**; `curl -A "<full Chrome UA>"` → **429**; `fetch` and `node:https` from the worker → **429** whatever the agent. The block is the client's TLS/agent pair, not the header alone |
| Yahoo USD shorthand | `USDJPY=X` answers `symbol: "USDJPY=X"`, but `JPY=X` answers the same 159.937 — a pair that starts with USD comes back under the three-letter shorthand, so `^[A-Z]{3}=X` must be normalised to `USD…` |
| Yahoo unknown pair | `EURXXX=X` and `XAUUSD=X` → **404** with `{"chart":{"result":null,"error":{"code":"Not Found",…}}}`. With `curl -f` the line is dropped, which is the per-pair fallback the widget relies on |
| Yahoo history | `period1/period2&interval=30m` → 242 points for 7 days; `range=1d&interval=1d` → **one** point, so a 24 h line needs `interval=5m` |
| CoinGecko history | `GET /api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=1` → 0.11 s, `{"prices":[[epochMs, price], …]}` at five-minute steps |
| rate limits | neither response carries a rate-limit header. CoinGecko's free tier is documented as per-IP and shared; one request per open window per minute is far below it |

## Shape

One `view` command, `prices`:

- two sections, **Crypto** and **FX**, each row a ticker: price in its quote
  currency, the change as a coloured tag, and the source plus age in the subtitle;
- `Open Chart` (`ctrl+o`) → the CoinGecko coin page or the Yahoo quote page;
- `Copy Price` (`ctrl+c`), `Refresh` (`ctrl+r`);
- values are read on open and every 60 s while the window stays open;
- preferences: `crypto` (CoinGecko ids, comma-separated, empty hides the section),
  `vsCurrency` (default `usd`), `fxPairs` (`BASE/QUOTE`, empty hides it).

An empty preference draws no section; both empty says so instead of an empty list.

## What is cut, and why

- **The chart popup** — 363 QML lines plus a third of `Model.js`; a browser page
  for the same ticker carries more ranges.
- **The bar pill, rotation, scroll and tooltip** — there is no bar, and a list
  shows every ticker at once.
- **`refreshMinutes` as a preference** — the window lives a minute or two; the
  upstream default of five would show one refresh and then a stale figure.
- **The manual retry timer** (one minute, three attempts) — the next 60 s tick is
  the retry.
- **The Quickshell IPC and the `shell.json` settings path** — the preferences are
  the manifest's.

## Not verified

- The port's checks use fixtures recorded above, not a second live run.
- The **stale-quote age rule** was not exercised live: every Yahoo answer that
  arrived was seconds old. The forced-429 path did exercise the *no quote → ECB*
  half, which is what a closed market or a blocked request produces.
- **CoinGecko's rate limit** was not hit and its threshold is not in the response.

## Live launch

`vicinae 'vicinae://launch/@black/prices/prices'`, 2026-11-13:

- the window listed **BTC** and **ETH** from CoinGecko with the 24 h change, and
  **EUR/USD** and **GBP/USD** from Yahoo with the fetch time and day change;
  stderr empty, log clean;
- a relaunch while Yahoo answered `429` showed both pairs as
  `ECB reference rate · 2026-11-12` — the fallback observed, not unit-tested;
- swapping to `curl` with the short agent brought the Yahoo rows back.

The fingerprint measurement above is why the request is a `curl` subprocess.
