# dpaste, measured

Measured 2026-10-22 against the live service. Every request and field below was
called once; nothing is inferred from the docs alone.

## Creating a paste

`POST https://dpaste.com/api/v2/`, form-encoded, no authentication:

| Field | |
| ----- | --- |
| `content` | required |
| `title` | optional; omitted when blank |
| `syntax` | optional; an identifier from `/api/syntax-choices`; omitted for plain text |
| `expiry_days` | 1 to 365, default 1 |

Answer `201 Created`, with the item URL in the `Location` header **and** in the
body. `Expires` carries the expiry date.

Items are anonymous and **unlisted**, not private: the link is not published,
but anyone holding it can read the paste. There is no way to list anonymous
items, which is why the extension has no list command and why dpaste replaces
`pastebin`'s two commands with one.

Deleting an item needs the account that posted it; the extension cannot undo a
paste.

## Rate limit

The terms ask for at most one request per second, and the response carries
`RateLimit: 1; window=1`. A second paste sent immediately after the first was
accepted in one measurement, but the limit is there; on 429 the extension says
to wait and retry instead of failing silently.

## Syntax identifiers

`GET https://dpaste.com/api/syntax-choices` returns a JSON object of
`identifier -> label`, about 13 kB, `Cache-Control: max-age=86400`. The
extension ships a curated subset instead of fetching it, so the form works
offline and the menu is short. Two identifiers are not what one would guess:

- Ruby is `rb`, not `ruby`.
- There is no `tsx` entry; TypeScript is `ts` and JSX is `jsx`.

`npm test` checks the curated list against the live JSON when the host is
reachable, and reports `SKIP` when it is not.

## The certificate is newer than either trust store

The chain is `dpaste.com` -> `YR1` -> `ISRG Root YR`, a Let's Encrypt root
issued in 2025. It is absent from both this machine's `ca-certificates`
(20240618) and the CA bundle inside Node 26.12.0 (121 roots). As a result
`fetch` fails with `TypeError: fetch failed` before any request is sent; curl
says `unable to get local issuer certificate`.

The extension therefore carries the root as `assets/isrg-root-yr.crt` and adds
it to the process's defaults with `tls.setDefaultCACertificates` before the
request:

```ts
setDefaultCACertificates([...getCACertificates("default"), root]);
```

That is the whole fix. It is per worker process, touches no system store, needs
no environment variable, and is a no-op once Node bundles the root itself. On a
Node without `setDefaultCACertificates` the call is skipped and the failure
message names the CA store, because that detail lives in `error.cause` rather
than in `fetch`'s own message.

Measured before and after: without the root, the toast read "Could not reach
dpaste.com."; with it, a clean install (no `NODE_EXTRA_CA_CERTS`, no grant in
the system store) created a paste and put the link on the clipboard, and the
raw view at `<url>.txt` returned the exact content.

If another Node-based tool fails on the same host, the process-level
alternatives still apply: `NODE_EXTRA_CA_CERTS=/path/to/root-yr.pem`, or
`trust anchor` plus `--use-system-ca`. The root:
<https://letsencrypt.org/certs/gen-y/root-yr.pem>.
