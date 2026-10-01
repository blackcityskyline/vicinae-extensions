# Translate

A port of the Raycast extension
[`google-translate`](https://github.com/raycast/extensions/tree/main/extensions/google-translate):
translate text, or the text you have selected, using Google's own endpoint. No
key, no account, nothing to run locally.

All six commands are here, with the reference's own layout:

| Command | What it does |
| --- | --- |
| **Translate** | Type into the search bar. One target translates both ways; more than one gives a row per target |
| **Translate Form** | Text in, translation out, language pickers either side |
| **Quick Translate** | Type, and every target answers at once |
| **Instant Translate Copy** | Translates the selection and copies it |
| **Instant Translate Paste** | Translates the selection and pastes it back |
| **Instant Translate View** | Translates the selection and shows it on screen |

Preferences are the reference's: source language, primary and secondary target,
autofill from the selection, what `Return` does, result ordering, and the saved
language sets with their own manager.

## The endpoint

```
GET  https://translate.google.com/translate_a/single
     ?client=dict-chrome-ex&sl=auto&tl=ru&ie=UTF-8&oe=UTF-8&otf=1&kc=7
     &dt=at&dt=bd&dt=ex&dt=ld&dt=md&dt=qca&dt=rw&dt=rm&dt=ss&dt=t&q=<text>
POST the same url with q in the body, once the url would pass 2048 characters
```

No token. Plain `fetch`. The full measurement is in
[`docs/audits/translate.md`](../../docs/audits/translate.md).

**`client=gtx` is a 429, and that is not Google's answer in general.** The
`translate.googleapis.com` host with `client=dict-chrome-ex` answers 200 with a
thin answer, and `translate.google.com/translate_a/single` answers 200 with the
full one. The port is not on `gtx`.

**The token is not needed.** The reference fetches three megabytes of
`translate.google.com`, greps `tkk:'…'` out of it, hashes the text with that and
appends `&tk=`. Google has deleted the pattern, so the token is derived from a
zero and the request works without one. `test/live.test.ts` checks that the
endpoint still answers without it.

## What this port adds

Everything else is the reference, structure and behaviour included.

### The output is the point

The response is a positional array with fourteen slots. The reference reads two of
them — the translation and its transliteration. This reads the rest:

| | |
| --- | --- |
| **synonyms, grouped by part of speech** | slot 1, each with the score Google ranked it by, strongest first |
| **alternative renderings** | slot 5 |
| **definitions with example sentences** | slot 12, in English |
| detected source language | slot 2, which is not what was asked for when the source is auto |
| typo correction | slot 7 |

All of it was in the response and thrown away. A row's detail panel now shows the
text that was typed, the translation, the transcription, and whichever of the
above exists — and a translated paragraph, which has no dictionary at all, shows
no empty headings.

### Three bugs of my own, found by the user

**Both list commands hung at "Translating..." for ever.** A hook returned a new
array on every render, and that array was an effect dependency, so the effect
re-ran, `live` went false, and the answer was thrown away as stale. The log says
it plainly: `got rows 2`, three times, and not one render with a result. Fixed by
memoising the targets and the selected set, and by depending on primitives only.

**Quick Translate handed the input straight back.** It seeded its target
languages from the preferences once and kept them for ever, so changing `lang2`
left it translating into English, twice — and translating English to English
returns the input. Both preferences default to English, so a first run looked
dead. The preferences are the default again, and repeats are dropped.

**A request could never time out.** `fetch` had no deadline, so one hung request
was a spinner that never ended. Fifteen seconds, and words instead of a spinner.

### On this desktop the Instant commands cannot work

They need the clipboard, and neither API returns what the clipboard holds:
`getSelectedText()` gave a selection from ten minutes earlier, and
`Clipboard.readText()` gave `""` while `wl-paste` in the same shell returned a
URL owned by another application. `Translate Form` is the only command with no
clipboard dependency, and it is the only one that worked. The clipboard fallback
is in — on Wayland `ctrl+C` puts text in the ordinary clipboard while
`getSelectedText` reads the primary selection — but it cannot be verified here.

### Two bugs in the reference, fixed rather than copied

**The list empties itself as you type.** No `List.Item` in the reference passes
`keywords`, while the search bar is bound to the text being translated. The
filter therefore matches the *translation* against the *English you are typing*,
and every row is filtered out. It works for a pasted selection and breaks for
typing. Here `keywords` carries the source, the translation, the transliteration,
every synonym, every alternative and every definition.

**An unknown language name throws.** `translate.tsx` reads `langFrom.name` with no
optional chaining on one line and `langFrom?.name` on the next. Google detects
languages the 249-entry table has never heard of, so the table lookup returns
`undefined` and the whole command dies. Every language label goes through
`asLanguage`, which falls back to the code.

### The rest of the differences

| | |
| --- | --- |
| **TTS plays on Linux** | the reference downloads to the fixed path `/tmp/translation.mp3` and plays it with `afplay`, which is macOS only, where two concurrent plays fight over one file. Google serves the audio at a url and `mpv` plays that url directly: nothing is downloaded, nothing is shared |
| **The two duplicated result components are one** | `DoubleWayTranslateItem` and `MultiTranslateItems` were 95% the same code, differing only in which function produced the rows. That duplication is also where the unguarded `.name` lived |
| **The three language preferences are `required: false`** | a required preference left unset makes Vicinae refuse to start the command and log nothing at all. Same defaults. See [`docs/api-porting.md`](../../docs/api-porting.md) |
| **The `proxy` preference is gone** | the reference sends through `undici` for its dispatcher. That import is inlined by the bundler and every command goes from 13 kB to 562 kB, which is enough to miss the worker's one-second handshake. Node's `fetch` takes no dispatcher, and an installed extension has no `node_modules` to resolve it from. `NODE_USE_ENV_PROXY` covers the machine-wide case |

## Tests

| File | What |
| --- | --- |
| `test/request.test.ts` | the url, the data types, and the GET/POST switch |
| `test/parse.test.ts` | the fourteen slots, against bodies captured from the endpoint |
| `test/result.test.ts` | the detail panel, and that nothing empty is ever rendered |
| `test/sets.test.ts` | language pairs, language sets, and the website link |
| `test/storage.test.ts` | reading back what was stored, including `null` |
| `test/live.test.ts` | the endpoint, live: a word, a sentence, a typo, 2700 characters by POST, ten requests at once, one target both ways, two targets as two rows |

57 checks, 17 of them live against the endpoint. No key, so they are not optional.