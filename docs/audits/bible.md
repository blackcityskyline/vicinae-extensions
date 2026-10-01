# Audit: `bible` → upstream deployed, parser repaired

Source: `raycast/extensions`, `extensions/bible` — author `josmithua`, one command,
five command preferences, two arguments.

## What ships

Upstream `src/`, deployed, with the parser replaced and one shortcut reshaped.

| File | Change |
| --- | --- |
| `src/parse.ts` | **new.** the parser, out of `bibleGatewayApi.ts` so it can be checked |
| `src/bibleGatewayApi.ts` | calls `parse.ts`; reads the version and copyright itself |
| `src/bibleSearch.tsx` | one shortcut reshaped; JSON path back to upstream's relative form |

## The parser reads two things that are no longer on the page

Upstream fetches `biblegateway.com/passage/?…&interface=print` and pulls four things off
it with cheerio. Measured on the bytes the site returns **today**:

| Selector | Count on the fetched page | |
| --- | --- | --- |
| `.passage-table` | 1 | present |
| `p .text` | 10 | present — but all ten are `<span class="text">` in the navigation menu |
| `sup.versenum` | 2 | present, inside the verse |
| `.bcv` | 1 | only inside a `<style>` block, never as an element |
| `span.chapternum` | **0** | gone |

So `reference` and `chapter` had nowhere to come from: a passage came back with an empty
reference and `NaN` for a chapter. Not a crash — a list of blank rows.

What replaced them:

```html
<div class="passage-table" data-osis="John.3.16">
<p><span id="en-NRSVUE-26127" class="text John-3-16">
     <sup class="versenum opening">16 </sup>For God so loved the world…
```

`data-osis` carries book.chapter.verse, and the span's class carries the same triple. The
class form is what makes the chapter available again, and it is split on the **last two**
hyphens because the book side may itself contain a digit.

Book names are whatever biblegateway abbreviates them to. Measured:

| Query | `data-osis` | class |
| --- | --- | --- |
| `1 Samuel 2:3` | `1Sam.2.3` | `1Sam-2-3` |
| `Psalms 23:1` | `Ps.23.1` | `Ps-23-1` |
| `2 Corinthians 5:7` | `2Cor.5.7` | `2Cor-5-7` |

## Checks run against the fetched page, not a sample

`test/fixture-john-3-16.html` and `fixture-john-3-16-ru.html` are the bytes
biblegateway.com returned, fetched today. A hand-written sample would have carried
`.bcv` and `span.chapternum` and passed against markup the site no longer sends — which
is the whole failure.

One check asserts the selectors are *still* gone. If they come back, it fails, and the
message says the workaround can go.

Two checks were wrong before the parser was:

- `osisToReference("1Samuel.1.1")` was expected to give `"1 Samuel 1:1"`. Both the
  spelling and the space were invented; the site sends `1Sam`.
- `assert.equal` was used on an object, which compares by reference and fails on two
  structurally identical results. It was `deepEqual`.

## Russian: the text is there, the input is not

233 versions ship in `assets/bible-versions.json`, three of them Russian, and one is
**RUSV — Russian Synodal Version**:

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

**Bible Gateway does not accept Russian book names at all.** Measured on `Иоанна 3:16`,
`Иоанн 3:16` and `John 3:16` with `version=RUSV`:

```
Иоанна 3:16   passage-table:0    <title>Иоанна 3:16 RUSV -  -
Иоанн 3:16    passage-table:0    <title>Иоанн 3:16 RUSV -  -
John 3:16     passage-table:1    data-osis="John.3.16"
```

An empty result, not an error. So the Russian text is fully available and the reference
has to be typed in English. That is worth saying in the extension's own description, or
a Russian speaker types `Иоанн 3:16`, gets nothing, and concludes the extension is
broken.

## Manifest

Upstream's five command preferences and two arguments, kept. Two schema fixes: four
checkboxes needed a `title` (Vicinae requires it, upstream ships only `label`), and the
per-platform shortcut `{macOS: …, windows: …}` had to become `{modifiers, key}` — the
same fix as in lastfm and downloads-manager, where the per-platform form binds nothing.

## Verified live

| | |
| --- | --- |
| `John 3:16` NRSVUE | 1 passage, `John 3:16`, chapter 3 verse 16, English text |
| `John 3:16` RUSV | 1 passage, Russian Synodal text |
| `1 Samuel 2:3` RUSV | 1 passage, `1Sam 2:3`, chapter 2 verse 3, Russian text |
| `Ps 23` KJV | 1 passage, whole chapter, `Ps.23.1-Ps 23:6`, verse 1 text correct |
| command loads | yes, no crash, empty stderr |
| `lint`, `check`, `test`, `build` | clean; 9 checks |

## Not verified

In `UNVERIFIED.md`. The list, the dropdown of 233 versions, the formatting options,
copy-to-clipboard, and the argument path.

One thing the checks cannot answer: whether a multi-passage query still de-duplicates.
`Ps 23` came back as a single passage whose reference spans `Ps.23.1-Ps 23:6`, which is
the shape the de-duplication was written for, but only one query exercised it.
