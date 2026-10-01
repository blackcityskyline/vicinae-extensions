# Translate

Translate text, or the text you have selected, using Google's own endpoint. No
key, no account, nothing to run.

Two commands:

| Command | What it does |
| --- | --- |
| **Translate Text** | Type into the search bar; the translation appears as you type |
| **Translate Selection** | Translates whatever was selected in the app you came from |

Preferences: the target language (249 of them) and whether `Return` copies the
translation or pastes it into the app you came from.

## The endpoint

```
GET  https://translate.google.com/translate_a/single
     ?client=dict-chrome-ex&sl=auto&tl=ru&ie=UTF-8&oe=UTF-8&otf=1&kc=7
     &dt=at&dt=bd&dt=ex&dt=ld&dt=md&dt=qca&dt=rw&dt=rm&dt=ss&dt=t&q=<text>
POST the same url with q in the body, once the url would pass 2048 characters
```

No token. No proxy support. Plain `fetch`. The full measurement, and the two
things I got wrong about it the first time, are in
[`docs/audits/translate.md`](../../docs/audits/translate.md).

**`client=gtx` is a 429, and that is not Google's answer in general.** The
`translate.googleapis.com` host with `client=dict-chrome-ex` answers 200 with a
thin answer, and `translate.google.com/translate_a/single` answers 200 with the
full one. The ported extension is not on `gtx`.

**The token is not needed.** The reference extension fetches three megabytes of
`translate.google.com`, greps `tkk:'…'` out of it, hashes the text with that and
appends `&tk=`. Google has deleted the pattern, so the token it computes is
derived from a zero and the request works without one. Measured, and
`test/live.test.ts` checks that the endpoint still answers without it.

## What it shows

The response is a positional array with fourteen slots. Upstream reads two of
them. This reads the rest:

| | |
| --- | --- |
| translation | joined from the segments in slot 0 |
| transliteration and IPA | slot 0, the one segment that carries them |
| detected source | slot 2, not what was asked for — `auto` decides per request |
| **synonyms, grouped by part of speech** | slot 1, ordered by the score Google gives each |
| **alternative renderings** | slot 5 |
| **definitions with example sentences** | slot 12 |
| typo correction | slot 7 |

The `dt` parameters decide what arrives, and asking for fewer still answers
`200` — just shorter. So nothing downstream would ever report what was missing;
`test/request.test.ts` pins the list.

## Two bugs in the reference, kept fixed

**The list empties itself as you type.** No `List.Item` in the reference passes
`keywords`, while the search bar is bound to the text being translated. The
filter therefore matches the *translation* against the *English you are typing*,
and every row is filtered out. It works for a pasted selection and breaks for
typing. Here `keywords` carries the source, the translation, the transliteration,
every synonym, every alternative and every definition.

**The detail panel shows the translation twice** — once as the title, once as the
markdown — and never shows the text that was typed. Here the source is the second
line of the panel.

## One guard the reference does not have

An unknown target language is not an error. Measured: `tl=xx` answers `200` with
the input unchanged, which is indistinguishable from a translation that needed no
change. So a mistyped preference silently does nothing. `translate()` refuses a
language that is not in the table, which cannot reject anything reachable from the
dropdown, because the dropdown is built from that same table.

## Not carried over

| | |
| --- | --- |
| `playTTS` | downloads to the fixed path `/tmp/translation.mp3` and plays it with **`afplay`**. macOS only, and two concurrent plays fight over one file |
| language-set manager | a preference does the same |
| round-trip translation | translating back into the source and showing it as a second result |
| `useCachedState` × 4 | four pieces of cached state for language sets nothing requires |
| proxy support | two dependencies, `undici` and `https-proxy-agent`, for a setting almost nobody sets |
| the language list in the manifest, twice | once, and read by the code from the same table |

Six commands became two. The other four were the same view with a different
default action.

## Tests

| File | What |
| --- | --- |
| `test/request.test.ts` | the url, the data types, and the GET/POST switch |
| `test/parse.test.ts` | the fourteen slots, against bodies captured from the endpoint |
| `test/result.test.ts` | the detail panel, and that nothing empty is ever rendered |
| `test/live.test.ts` | the endpoint, live: a word, a sentence, a typo, 2700 characters by POST, ten requests at once |

42 checks. The live ones need no key, so they are not optional.