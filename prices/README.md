# Prices

Crypto prices and FX rates, with the change over the last 24 hours or trading day.

It is a Vicinae front end for [`medden/omarchy-prices`](https://github.com/medden/omarchy-prices),
an Omarchy bar widget. The widget's bar pill, ticker rotation and its click-to-open QML chart are
cut; every ticker is one list row, and `Open Chart` sends the browser to the same ticker's public
page.

## Command

| Command    | Description                                                            |
| ---------- | ---------------------------------------------------------------------- |
| **Prices** | Crypto and FX tickers in two sections, refreshed while the window is open |

## Actions

| Action        | Shortcut | Description                                              |
| ------------- | -------- | -------------------------------------------------------- |
| Open Chart    | `ctrl+o` | The CoinGecko coin page, or the Yahoo Finance quote page |
| Copy Price    | `ctrl+c` | The price with its currency, ready to paste              |
| Refresh       | `ctrl+r` | Read every ticker again, now                             |
| Open Preferences | `ctrl+,` | Change the coins, the quote currency or the pairs     |

`ctrl+o` is the launcher's generic *open* verb, so a keybind remap is honoured.

## Preferences

| Preference           | Default             | Meaning                                                         |
| -------------------- | ------------------- | --------------------------------------------------------------- |
| Crypto               | `bitcoin,ethereum`  | CoinGecko coin ids, comma-separated (the last part of the coin's CoinGecko URL). Empty hides crypto |
| Crypto quote currency | `usd`              | The currency crypto prices are quoted in                        |
| FX pairs             | `EUR/USD,GBP/USD`   | `BASE/QUOTE` pairs, comma-separated. Empty hides FX             |

## How it works

Crypto comes from CoinGecko's keyless `/simple/price`, one request per refresh for all coins, with
the 24-hour change in the same response.

FX comes from Yahoo Finance's chart endpoint, one request per pair. If Yahoo has no quote for a
pair — it does not list every currency — the rate comes from the ECB's daily reference rates, read
once from Frankfurter and crossed locally, so any pair works. The row says which source it used,
and the ECB row carries its fixing date: those rates update once per business day around 16:00 CET
and do not move at weekends.

A refresh happens when the command opens and every minute while the window stays open; nothing
runs once it is closed. A failed refresh keeps the last prices on screen and adds a `Last refresh
failed` row with the error; without a previous read, the window says what failed and offers
`Try Again`.

Yahoo answers `429` to Node's HTTP client from this machine regardless of the user agent; `curl`
with the short `Mozilla/5.0` agent answers `200`, so Yahoo is read through `curl`, as the widget
did. The table is in [`docs/audits/prices.md`](../docs/audits/prices.md).

## Requirements

- `curl` (installed by default on Omarchy), used for the Yahoo Finance requests only.
- Internet access to `api.coingecko.com`, `query1.finance.yahoo.com` and `api.frankfurter.dev`.
- No account, no API key, nothing to configure beyond the three preferences.

## Limits

CoinGecko's free tier is rate-limited per IP. One request per open window per minute is well
inside it; several launchers open at once on the same address share the limit. A mistyped coin id
is not an error — CoinGecko answers `200` with the coin missing — so the section says it has no
quote for the ids rather than pretending the fetch failed.
