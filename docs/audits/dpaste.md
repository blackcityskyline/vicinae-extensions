# dpaste, measured

Measured 2026-10-22 and re-measured 2026-11-12 against the live service. Every
request and field below was called; nothing is inferred from the docs alone.

## Creating a paste

`POST https://dpaste.com/api/v2/`, form-encoded, no authentication:

| Field | |
| ----- | --- |
| `content` | required |
| `title` | optional; omitted when blank |
| `syntax` | optional; an identifier from `/api/syntax-choices`; omitted for plain text |
| `expiry_days` | 1 to 365, default 1 |

Answer `201 Created`, with the item URL in the `Location` header **and** in the
body. No `Expires` header: the expiry is only implied by `expiry_days`.

Items are anonymous and **unlisted**, not private: anyone holding the link can
read the paste. Anonymous items cannot be listed — `GET /api/v2/` answers `200`
with the HTML form, `/api/v2/list` and `/api/v2/list/` answer `404`, and the front
page has no list — so the extension has one command, not `pastebin`'s two.
Deleting needs the posting account; the extension cannot undo a paste.

## Rate limit

The terms ask for one request per second. Responses carry `RateLimit: 1;
window=1`, `RateLimit-Policy: 1; window=1` and `RateLimit-Remaining: 0` even on
the paste just accepted; a second POST five seconds later was also accepted
(`201`), so the limit is advertised, not enforced per second from this address.
On `429` the extension says to wait and retry.

## What it rejects

Every rejection is `400` with a JSON body, so the extension maps the status
rather than parsing field errors:

| Request | Body |
| ------- | ---- |
| no `content` | `{"errors": ["Missing required field 'content'"]}` |
| `expiry_days=0` or `366` | `{"errors": [{"expiry_days": "* expiry_days must be between 1 and 365"}]}` |
| `syntax=nosuch` | `{"errors": [{"syntax": "* Unknown syntax nosuch. Valid choices: abap …"}]}` — the whole list, several kB |

A missing `title` or `syntax` is accepted; a blank one is omitted, not sent
empty.

## Syntax identifiers

`GET https://dpaste.com/api/syntax-choices` returns `identifier -> label`, about
13 kB, `Cache-Control: max-age=86400`. The extension ships a curated subset, so
the form works offline and the menu is short. Two identifiers are not the
obvious ones:

- Ruby is `rb`, not `ruby`.
- There is no `tsx`; TypeScript is `ts` and JSX is `jsx`.

`npm test` checks the curated list against the live JSON when the host is
reachable and reports `SKIP` otherwise.

## The certificate is newer than either trust store

The chain is `dpaste.com` -> `YR1` -> `ISRG Root YR`, a Let's Encrypt root issued
in 2025, absent from this machine's `ca-certificates` (20240618) and from the
121-root bundle in Node 26.12.0. `fetch` therefore fails with `TypeError: fetch
failed` before sending, and curl says `unable to get local issuer certificate`.

The extension carries the root as `assets/isrg-root-yr.crt` and adds it to the
process defaults before the request:

```ts
setDefaultCACertificates([...getCACertificates("default"), root]);
```

Per worker process, no system store, no environment variable, a no-op once Node
bundles the root. Without `setDefaultCACertificates` the call is skipped and the
message names the CA store, since that detail sits in `error.cause`.

Measured before and after: without the root the toast read "Could not reach
dpaste.com."; with it, a clean install (no `NODE_EXTRA_CA_CERTS`, no system store
grant) created a paste, put the link on the clipboard, and `<url>.txt` returned
the exact content.

Elsewhere the process-level alternatives still apply:
`NODE_EXTRA_CA_CERTS=/path/to/root-yr.pem`, or `trust anchor` plus
`--use-system-ca`. The root: <https://letsencrypt.org/certs/gen-y/root-yr.pem>.
