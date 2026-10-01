# Audit: `lastfm` → upstream deployed, five additions

Source: `raycast/extensions`, `extensions/lastfm` — **not** `eggsy/lastfm`, which
does not exist on GitHub. The ROADMAP entry named that; it was wrong.

Seven commands upstream: `menubar`, `now-playing`, `combined`, `songs`, `recent`,
`artists`, `albums`. Five preferences: `apikey`, `apiSecret`, `username`, `limit`,
`period`.

## What ships

Upstream, deployed. `src/` differs from the tree in seven files, all of them
additions or measured fixes — no rewrite:

| File | Change |
| --- | --- |
| `src/browse.tsx` | **new command.** Global Charts, This Week, Your Library, Find Artist |
| `src/functions/browse.ts` | the read-only calls behind it, one response member verified per method |
| `src/components/rows.tsx` | shared rows with `keywords` and the "Open on…" actions |
| `src/components/artist-detail.tsx` | **new.** An artist page — upstream has none |
| `src/utils/lastfm.ts` | pure readers: `named`, `unwrapList`, `imageUrl`, `checked`, `stripHtml` |
| `src/artists.tsx`, `albums`, `recent`, `songs`, `combined` | one `keywords` prop per row |
| `src/now-playing.tsx`, `src/hooks/useTrackLoved.ts` | type coercions only — see the manifest note |

`menubar` is cut, at the user's request.

## The manifest, and one measured reason

Everything else is upstream's. Three changes:

1. `platforms: ["Linux"]`, `author`, and `vici` build scripts.
2. `categories: ["Media"]` — Raycast's `"Music"` is not in Vicinae's schema.
3. `apikey` and `username` become `required: false` with an empty default.

The third is the one that matters. **A required preference left unset makes Vicinae
refuse to start the command and log nothing at all** — no `Loaded extension`, no
error. `apikey` and `username` have no default, so a fresh install hits exactly
that. Making them optional with an empty default keeps them a `string` instead of
`string | undefined`, which is why the coercion in `now-playing.tsx` and
`useTrackLoved.ts` is needed at all: five call sites, nothing else.

`limit` and `period` keep `required: true` — both carry a default, so they are never
unset and the silent-block cannot happen.

`apiSecret` stays optional and unused by anything added here. Measured earlier: with
a key alone, all 35 read methods answer; write methods fail silently without a
session. The reference's love/unlove need the session, and they are left as it
shipped.

## Response members, verified one at a time

Every one of these was measured, because reading the wrong one does not error — it
returns `undefined`, `unwrapList` turns that into `[]`, and an empty list is
indistinguishable from an account with nothing in it. `checked()` turns the
disagreement into an error instead.

| Method | Member |
| --- | --- |
| `chart.getTopArtists` | `artists` |
| `chart.getTopTracks` | `tracks` |
| `user.getWeeklyArtistChart` | `weeklyartistchart` |
| `user.getWeeklyTrackChart` | `weeklytrackchart` |
| `library.getArtists` | `artists` |
| `artist.search` | `results.artistmatches.artist` |
| `artist.getInfo` | `artist` |
| `user.getTopArtists` | `topartists` — upstream already reads this one correctly |

Shapes that are not what the names suggest:

- `artist` is named two ways: `getrecenttracks` sends `artist["#text"]`,
  `getlovedtracks` and `gettopalbums` send `artist.name`. Reading one leaves every
  row from the other as "Unknown artist".
- A collection of one arrives as a **bare object**, not an array of one.
- `artist.getInfo` sends `tags.tag` as `[{name, url}]`, not strings.
- `bio.summary` is HTML.
- Images can be `""` for an account with no artwork, which renders as a broken image.
- `user.getWeeklyChartList` is useless: 1128 entries, every one `{ "#text": "", from, to }`.

## The filter bug, which is upstream's

**No `List.Item` in the extension passes `keywords`**, in any of the seven commands.
The search bar is the field the text is typed into, so the list filters the rows
against that text: a row titled `привет` is filtered out by the word `hello`, and the
list empties itself as you type. One prop per row fixes it.

## Verified live

| | |
| --- | --- |
| global charts | 50 artists, 50 tracks |
| weekly charts | 6 artists, 8 tracks |
| library page 1 | 50 rows, more available |
| `artist.search` | 25 matches |
| `artist.getInfo` | 8 457 582 listeners, 1 426 496 499 plays, tags, 5 similar artists, 602 characters of bio |
| unknown artist | `Last.fm error 6: The artist you supplied could not be found` |

All seven commands load, no crash, empty stderr. Eight checks in
`test/lastfm.test.ts`, one of them live against the endpoint when `LASTFM_KEY` is set.

## Not verified

In `UNVERIFIED.md`. The interesting one: `browse` returned `503` twice during
development while `curl` to the same URL answered `200` — intermittent, and not a
User-Agent issue, since both a bare and a browser UA worked at the same moment.