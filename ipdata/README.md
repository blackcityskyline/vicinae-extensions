# ipdata

Look up any IPv4 or IPv6 address or hostname with [ipdata](https://ipdata.co): city and
country, operator (ASN), owner, coordinates, local time and currency, and with an API key
VPN, proxy, Tor and threat intelligence. Ported from
[jonathan_k/ipdata](https://github.com/raycast/extensions/tree/df41fcee397bfa09065295c96c1e47437e194512/extensions/ipdata)
at `df41fce` and deployed as written; only the manifest, the icon path and the tsconfig
changed.

No account is needed: without a key the extension uses ipdata's free tier.

## Commands

| Command | What it does |
| ------- | ------------ |
| **Look Up IP** | Type an address or a hostname. A hostname lists every address it resolves to. The selected address shows place, map, region, postal code, continent, coordinates, time zone, local time, currency, languages and calling code, with tabs for Raw JSON, Analysis, Scores, Flags, Blocklists, Connection, Operator and Owner. With nothing typed it shows your own addresses. |
| **My IP** | Your public IPv4 and IPv6 addresses with their details. A missing family reads "No IPv6 connectivity". |
| **Look Up Clipboard IP** | Finds the first address on the clipboard, also inside URLs, log lines and `host:port`, and shows place and operator in a HUD. |
| **Look Up Selected IP** | The same, for the text selected in the frontmost app; falls back to the clipboard when nothing is selected. |

## Differences from the Raycast extension

- **IP Menu Bar is cut.** Vicinae has no menu-bar commands, so the `menu-bar` command and
  `src/menu-bar.tsx` are gone, along with the `Menu Bar Label` preference it carried.
- **Map action.** `Open in Maps` targets Apple Maps' URL, which opens in the browser on
  Linux; `Open in Google Maps` is next to it in the same panel.

## Preferences

| Preference | Default | Notes |
| ---------- | ------- | ----- |
| **API Key** | empty | Optional. Unlocks company, carrier, VPN, proxy, Tor and datacenter flags, trust and threat scores and blocklists, and removes the free tier's daily limit. Get one at [dashboard.ipdata.co](https://dashboard.ipdata.co). |
| **API Endpoint** | Global | `api.ipdata.co`, or `eu-api.ipdata.co` for EU data residency. Only used with a key. |

## Free tier

Without a key: city, region, country, coordinates, postal code, ASN, organization and time
zone, at 1 000 city-level lookups a day per connection; after that ipdata returns country-level
data until the daily reset. Analysis, Scores, Flags and Blocklists need a key.

Lookups are cached for an hour, and your own addresses for two minutes.

## Privacy

Only the address being looked up is sent to ipdata. Private, loopback, link-local,
carrier-grade NAT, multicast and documentation addresses are recognized locally and never
sent. Hostnames go through the system resolver. Map tiles come from ipdata.co.

## Attribution

Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors. Flags are
[Twemoji](https://github.com/twitter/twemoji) (CC-BY 4.0).
