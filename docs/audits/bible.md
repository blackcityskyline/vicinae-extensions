# `bible` — upstream deployed, parser repaired

Source: `raycast/extensions`, `extensions/bible` — author `josmithua`. Upstream: one command, five command
preferences, two arguments; a second command, **Random Passage**, is ours.

## What ships

Upstream `src/`, deployed, parser replaced, one shortcut reshaped.

| File | Change |
| --- | --- |
| `src/parse.ts` | **new.** the parser, out of `bibleGatewayApi.ts` so it can be checked |
| `src/bibleGatewayApi.ts` | calls `parse.ts`; reads the version and copyright itself |
| `src/bibleSearch.tsx` | one shortcut reshaped; JSON path back to upstream's relative form |

## The parser reads two selectors the page no longer has

Upstream fetches `biblegateway.com/passage/?…&interface=print` and pulls four things off it with cheerio. Counts
on the bytes the site returns today:

| Selector | Count on the fetched page | |
| --- | --- | --- |
| `.passage-table` | 1 | present |
| `p .text` | 10 | present — but all ten are `<span class="text">` in the navigation menu |
| `sup.versenum` | 2 | present, inside the verse |
| `.bcv` | 1 | only inside a `<style>` block, never as an element |
| `span.chapternum` | **0** | gone |

`reference` and `chapter` had nowhere to come from: a passage came back with an empty reference and `NaN` for a
chapter — a list of blank rows, not a crash. What replaced them:

```html
<div class="passage-table" data-osis="John.3.16">
<p><span id="en-NRSVUE-26127" class="text John-3-16">
     <sup class="versenum opening">16 </sup>For God so loved the world…
```

`data-osis` carries book.chapter.verse, and the span's class carries the same triple. The class form makes the
chapter available again; it splits on the **last two** hyphens because the book side may itself contain a digit.
Book names are whatever biblegateway abbreviates them to:

| Query | `data-osis` | class |
| --- | --- | --- |
| `1 Samuel 2:3` | `1Sam.2.3` | `1Sam-2-3` |
| `Psalms 23:1` | `Ps.23.1` | `Ps-23-1` |
| `2 Corinthians 5:7` | `2Cor.5.7` | `2Cor-5-7` |

## Checks read the fetched page, not a sample

`test/fixture-john-3-16.html` and `fixture-john-3-16-ru.html` are the bytes biblegateway.com returned; a
hand-written sample carrying `.bcv` and `span.chapternum` passes against markup the site no longer sends. One
check asserts the selectors are *still* gone and fails if they return.

Two checks were wrong: `osisToReference("1Samuel.1.1")` was expected to give `"1 Samuel 1:1"` (the site sends
`1Sam`), and `assert.equal` was `deepEqual`, since it compares objects by reference.

## Russian

233 versions ship in `assets/bible-versions.json`, three Russian, one **RUSV — Russian Synodal Version**:

```
NRT    New Russian Translation
ERV-RU Russian New Testament: Easy-to-Read Version
RUSV   Russian Synodal Version
```

`version=RUSV` returns Russian text, verified:

```
Иоанна 3:16 [RUSV]  →  0 passages
John 3:16  [RUSV]  →  1 passage, "John 3:16" гл.3:16
   “Ибо так возлюбил Бог, что Он Сына Своего Единородного дал, чтобы всяк, верующий в Него…”
```

**Bible Gateway does not accept Russian book names at all.** Measured on `Иоанна 3:16`, `Иоанн 3:16` and
`John 3:16` with `version=RUSV`:

```
Иоанна 3:16   passage-table:0    <title>Иоанна 3:16 RUSV -  -
Иоанн 3:16    passage-table:0    <title>Иоанн 3:16 RUSV -  -
John 3:16     passage-table:1    data-osis="John.3.16"
```

An empty result, not an error. `src/books.ts` translates the query for all 66 books: `Иоанн 3:16` leaves as
`John 3:16`, `1 Кор 13:4` as `1 Corinthians 13:4`, `Песнь Песней 2:1` as `Song of Solomon 2:1`. The same table
runs in reverse for display: a reference on a Russian version reads `Иоанна 3:16 (RUSV)`.

**Numbering is not translated.** Bible Gateway shows Russian text under its own (English) chapter numbers with
the Synodal number beside it: `Ps 23` on RUSV comes back as `23 (22-1)`, the text of Synodal psalm 22. A Russian
user typing `Пс 23` gets the psalm the site numbers 23, not the one a Synodal Bible numbers 23. Shifting the
chapter would make the site's own reference wrong; the caveat is documented instead.

**Ranges were glued.** `data-osis="Ps.23.1-Ps.23.6"` used to become `Ps.23.1-Ps 23:6`, because only the dots were
split. Each end is converted separately now and the attribute's own hyphen is kept.

## Manifest

A second view command, `randomPassage`, opens one random chapter from the version the search command remembers. It
has no preferences: duplicating the five checkboxes would let the two commands disagree. The book list and
chapter counts live in `src/books.ts`; "Another passage" (`Ctrl+R`) redraws without reopening.

Upstream's five command preferences and two arguments, kept. Two schema fixes: four checkboxes needed a `title`
(Vicinae requires it, upstream ships only `label`), and the per-platform shortcut `{macOS: …, windows: …}` had to
become `{modifiers, key}` — as in lastfm and downloads-manager, where the per-platform form binds nothing.

## Formatting, checked

`test/format.test.ts` reads the same fetched pages and the real 233-version list. It covers the markdown and
clipboard builders: verse numbers, one verse per line, references with the version abbreviation, the
preview-only copyright, string-shaped passages, multiple passages, and the reference parser that accepts a
version after the query (`John 3:16 NIV`, `(niv)`, `[NRSVUE]`) while leaving an unknown word in the query.

Two readers in `bibleGatewayApi.ts` were wrong: `versionOf` expected text directly inside `<strong>`, but the
site wraps a link there — `<strong><a …>Name</a> (NRSVUE)</strong>` — so the version came back empty and every
reference line read `John 3:16 ()`; `copyrightOf` stopped at the first child element, and the Russian notice
`by <a …>Public Domain</a>` read as `by`.

Both unwrap tags before trimming, and the checks fail against the old code: the version fixture and the live
search expect the abbreviation, the Russian fixture expects `by Public Domain`.

Two live checks call the real `search` — `John 3:16` NRSVUE and `Иоанн 3:16` RUSV — and SKIP only when the site
does not answer.

`normalizeQuery` and `localizeReference` are checked without the network, including a multi-passage query
(`Ин 3:16, Пс 23:1`), an unknown book left as typed, and a range
(`Ps 23:1-Ps 23:6` → `Псалтирь 23:1-Псалтирь 23:6`).

## Verified live

| | |
| --- | --- |
| `John 3:16` NRSVUE | 1 passage, `John 3:16`, chapter 3 verse 16, English text |
| `John 3:16` RUSV | 1 passage, Russian Synodal text |
| `1 Samuel 2:3` RUSV | 1 passage, `1Sam 2:3`, chapter 2 verse 3, Russian text |
| `Ps 23` KJV | 1 passage, whole chapter, `Ps.23.1-Ps 23:6`, verse 1 text correct |
| command loads | yes, no crash, empty stderr |
| Random Passage | opened, drew a chapter (`Марка 2:1-Марка 2:28`, RUSV), title localized |
| `lint`, `check`, `test`, `build` | clean; 28 checks |

## Not verified

The list, the dropdown of 233 versions, the formatting behind copy-to-clipboard (the clipboard itself is not
read), and the argument path.

Whether a multi-passage query still de-duplicates: `Ps 23` came back as a single passage spanning
`Ps.23.1-Ps 23:6`, the shape the de-duplication was written for, but only one query exercised it.
