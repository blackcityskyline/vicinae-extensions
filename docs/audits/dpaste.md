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

## The certificate is newer than this machine's trust

The chain is `dpaste.com` -> `YR1` -> `ISRG Root YR`, a Let's Encrypt root
issued in 2025. It is absent from both this machine's `ca-certificates`
(20240618) and the CA bundle inside Node 26.12.0 (121 roots). As a result
`fetch` fails with `TypeError: fetch failed` before any request is sent; curl
says `unable to get local issuer certificate`.

The extension reports this as "Could not reach dpaste.com. unable to get local
issuer certificate. The system CA store may be out of date." — that detail is in
`error.cause`, not in the message of `fetch` itself.

Fixing it on the user side, either:

```bash
# for the Vicinae workers, which run under /usr/bin/node
export NODE_EXTRA_CA_CERTS=/path/to/root-yr.pem   # before the launcher starts
```

or trust the root system-wide and let Node use that store:

```bash
sudo trust anchor root-yr.pem && sudo trust extract-compat
NODE_OPTIONS=--use-system-ca vicinae server
```

The root itself: <https://letsencrypt.org/certs/gen-y/root-yr.pem>.

The extension was verified end to end with the first form of this fix: it
created a paste, and the raw view at `<url>.txt` returned the exact content.
Without the fix, the same code path ends at the message above — which is how the
missing root was found.
