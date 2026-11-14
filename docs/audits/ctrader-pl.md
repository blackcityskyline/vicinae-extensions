# `ctrader-pl` ← `omarchy-ctrader-pl`

[gandhik/omarchy-ctrader-pl](https://github.com/gandhik/omarchy-ctrader-pl) (MIT, `9d4d352`, 2026-10-23) is an
Omarchy bar widget: 1 171 lines of QML and JavaScript for the pill and the popup, 998 lines of Python for the
data. Four jobs: an unrealised P/L pill in the bar, a popup listing every open position with balance, equity and
margin, a P/L histogram over 1h/6h/24h/7d, and Open API authorisation with the user's own application
credentials.

No upstream test suite, and nothing to install: the Python is standard library only. There is no Omarchy API
behind the numbers, only a documented network protocol and a systemd timer.

## What maps to what

| Omarchy widget | Here | Why |
| --- | --- | --- |
| bar pill: `+123.45 USD`, green / urgent / neutral, dimmed when stale | the `ctrader-pl` list: a **Total** row carrying the figure, the currency and the return %, with the status as its subtitle | a launcher has no bar. The list is the surface, and it must be opened |
| left click opens the popup | opening the command | same thing |
| right click restarts the poller | `Refresh` (`ctrl+r`), and a reconnect when the socket dropped | there is no daemon to restart |
| middle click copies the total | `Copy Total` (`ctrl+c`) on the total row | same |
| `Esc` closes, `Enter` refreshes | the window's own keys, plus `Refresh` | launcher behaviour |
| one row per position: symbol, side, lots, P/L, muted gross/swap/commission | one `List` row per position, sorted by absolute P/L | the upstream sort is the useful one |
| click a position → TradingView chart | `Open Chart` (`ctrl+o`) per position | same URL builder, ported |
| account row: balance / equity / used / free margin | a `Section` of four rows under the total | no labels column in a list |
| systemd poller: 10 s, heartbeat 10 s, backoff 5→60 s, state file | a session per open window: connect on mount, tick every 10 s, heartbeat, close on unmount | a launcher command must not leave a process behind. Nothing polls when the window is closed |
| P/L histogram, 8-day `history.jsonl`, pre-bucketed `chart.json` | **cut** | see below |
| `ctrader-auth` wizard: terminal prompts, loopback callback, account picker | a setup form: client id, secret, environment → browser → callback on `127.0.0.1:7331` → account dropdown | a launcher has forms and a browser, not a terminal |
| `setup` script: symlinks, systemd unit, `--uninstall --purge` | **cut** | there is nothing to install or keep running |
| config `~/.config/omarchy/ctrader/config.json`, `pollSeconds` | `environment.supportPath/config.json` (0600), fixed 10 s | the widget's path belongs to the widget |
| `showCurrency`, `profitColor`, `lossColor`, `staleAfterSeconds`, `chartOpenByDefault`, `chartRange`, `tradingViewExchange` | **cut** except a `tradingViewExchange` preference | the rest is bar styling; the list already shows the currency and the age |

**The histogram is cut.** Upstream's chart is a by-product of an all-day process: 10-second samples land in a log,
and the poller re-buckets them into `chart.json` for QML. Nothing runs in Vicinae while the window is closed, so
the log would only hold the minutes the list was open. The options are a `no-view` command with `interval: "60s"`
(`environment.launchType === LaunchType.Background`, as `tempmail/check-mail` does) plus a block-character
sparkline, or no chart. This port takes none. Upgrade path: a manifest line and a `Detail`.

## The protocol, measured

Nothing below needs credentials: the demo endpoint answers every unauthenticated request, and the shapes come
from Spotware's own generated descriptors ([`spotware/OpenApiPy`](https://github.com/spotware/OpenApiPy),
`ctrader_open_api/messages/*_pb2.py`, decoded with `protoc --decode=google.protobuf.FileDescriptorProto`).

| Thing | Measured |
| --- | --- |
| endpoints | `demo.ctraderapi.com` and `live.ctraderapi.com`, ports 5035 (protobuf) and 5036 (JSON), both open, TCP+TLS connect 45–203 ms |
| framing | bare JSON objects, **no length prefix**; a 4-byte prefix is answered `{"errorCode": "UNKNOWN_ERROR", "description": "Corrupted frame.", "payloadType": 2142}` |
| envelope | `{clientMsgId, payloadType, payload}`; replies carry `payloadType`, their own `payload`, and echo `clientMsgId` |
| idle timeout | a connection that sends nothing is closed by the server after **30 s** — hence the heartbeat |
| heartbeat | `payloadType 51` is a notification: sending it draws no reply, so a client must not wait for one |
| bad credentials | `{"errorCode": "CH_CLIENT_AUTH_FAILURE", "description": "clientId or clientSecret is incorrect", "payloadType": 2142}` in 129–131 ms, on both endpoints |
| typed fields | `clientId: 0` (a number) earns `INVALID_REQUEST … Expected string`; the JSON encoding is typed, so ids and volumes travel as strings |
| error replies | a failure arrives on `payloadType 2142` with `errorCode` and `description`. This *is* the error channel; no exceptions over the wire |
| token endpoint | `GET https://openapi.ctrader.com/apps/token?…` answers **HTTP 200** with `{"errorCode": "INVALID_REQUEST", "description": "Malformed client_id parameter"}` for a bad request — a 200 is not success, the body has to be read |
| authorise URL | `https://id.ctrader.com/my/settings/openapi/grantingaccess/?…` answers 301 to the same path without the trailing slash in 292 ms |
| callback port | `127.0.0.1:7331` is free on this machine, and the app's redirect URI has to be registered as exactly `http://localhost:7331/callback` |
| payload numbers | all thirteen the plugin uses are confirmed against `ProtoOAPayloadType`: app auth 2100/2101, account auth 2102/2103, assets 2112/2113, symbols 2114/2115, symbol by id 2116/2117, trader 2121/2122, reconcile 2124/2125, error 2142, accounts by token 2149/2150, unrealised P/L 2187/2188, heartbeat 51 |
| `ProtoOAGetPositionUnrealizedPnLRes` | `positionUnrealizedPnL` (repeated, field 3), `moneyDigits` (uint32, field 4) |
| `ProtoOAPositionUnrealizedPnL` | `positionId`, `grossUnrealizedPnL` (int64), `netUnrealizedPnL` (**int32**) — money is integer scaled by `10^moneyDigits` |
| `ProtoOAPosition` | `positionId`, `tradeData`, `swap`, `commission`, `price`, `usedMargin` (uint64), `moneyDigits` (uint32, field 15) — its own digits, **not** the response's |
| `ProtoOATradeData` | `symbolId`, `volume` (int64), `tradeSide` (enum), `openTimestamp` (int64) |
| `ProtoOASymbol` / `ProtoOALightSymbol` | `lotSize` and `digits` come from symbol-by-id; `symbolName` from the symbol list |
| `ProtoOATrader` | `balance`, `depositAssetId`, `moneyDigits` (field 20), `brokerName` (field 16) |
| `ProtoOAGetAccountListByAccessTokenRes` | `ctidTraderAccount` (repeated); each entry has `ctidTraderAccountId`, `isLive`, `traderLogin` only |
| TradingView | `https://www.tradingview.com/chart/?symbol=EURUSD` and `…?symbol=ASX%3ABHP` both answer 200 |

Two upstream defects came out of the descriptors:

- **`brokerTitleShort` does not exist in the API.** `ctrader-auth` and the poller read it from the account-list
  entry, whose message has five fields and none of them a broker title. The wizard's account lines print an empty
  broker, and `broker` in the config is always the `"cTrader"` fallback. The port reads `brokerName` from
  `ProtoOATrader` instead.
- `netUnrealizedPnL` is an `int32` while `grossUnrealizedPnL` is an `int64`; both go through the same `scale()`.

## The credential flow

The extension cannot ship credentials and cannot mint an account: **the user creates an Open API application**
at <https://openapi.ctrader.com/> (Applications → Add application), registers
`http://localhost:7331/callback`, and hands the client id and secret to the setup form. The scope requested is
`accounts`, read-only — the token cannot place, amend or close an order, and this extension sends no order
message at all.

First run: form → browser → broker login → redirect to a local server → code exchanged for a token → the token
lists the accounts it can see → the user picks one. The loopback server is the piece Vicinae does not provide: a
`node:http` server bound to `127.0.0.1:7331` for the length of the form costs about forty lines and gives a
browser page that says "Authorised". The alternative (upstream's fallback) asks the user to paste a URL out of a
browser that shows a connection error. `state` is checked against the value sent to cTrader, so a stray request
cannot consume the callback.

The client secret, access token and refresh token are written to `environment.supportPath/config.json` with mode
`0600`, read back on every command, never logged, never put in a toast or a row. The setup form's secret field is
a `Form.PasswordField`.

## The port

- `src/api/ctrader.ts` — the socket client: `node:tls` to `{demo,live}.ctraderapi.com:5036`, a JSON reader that
  frames on `JSON.parse` (concatenated objects must survive one read), `request()` that ignores heartbeats and
  matches on `clientMsgId`, errors raised from `payloadType 2142`. The address is injectable, so the tests drive
  it against a local server that speaks the same protocol.
- `src/api/oauth.ts` — the authorise URL, the loopback callback, the token exchange and refresh. `state` is
  random per run and compared before the code is accepted.
- `src/ctrader-pl.tsx` — one view: connect, then a total row, an account section and the positions, refreshed
  every 10 s while open, with a fresh connection after a failed tick. Actions: `Open Chart`, `Copy Total`,
  `Copy Value`, `Copy Symbol`, `Refresh`, `Change Account`.
- `src/components/SetupForm.tsx` — credentials, then the browser round trip, then an account picker when the
  token sees more than one account. Also pushed from the list when there is no config.
- `src/api/config.ts` — the `0600` config file, written to a temp file and renamed into place.
- `src/utils/format.ts` — the pure half of `Model.js`: money with thousands separators, signed money, percent,
  lots, "opened 2h 15m ago", the age of the last update, the TradingView symbol (including the
  `.US`/`.AU`/`.UK`/`.DE` share suffixes).

`python3` is not needed by the port; nothing runs as a subprocess, and there is no dependency beyond
`@vicinae/api`.

## Not verified

- **Everything behind authentication.** There is no cTrader account on this machine and no Open API application:
  `~/.config/omarchy` does not exist, `ctrader-auth` and `ctrader-poll` are not on `PATH`, and the API answers
  `CH_CLIENT_AUTH_FAILURE` to any app auth. Positions, P/L, the account row, the `moneyDigits` scaling,
  `lotSize`, `isLive` account selection and the token refresh come from the descriptors and from upstream's
  arithmetic, **not** from a live response.
- **The authorisation round trip.** The URL builds and 301s, the callback port binds, but the grant needs the
  owner's client id and secret and a broker login. Nothing was exchanged.
- **The histogram.** Cut, so nothing to verify.

Proving any of it needs one free demo account with Open API access. Until then the port can be gated, launched
and driven as far as the setup form, and no further.
