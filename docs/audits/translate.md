# Audit: `google-translate` → `translate`

Source: `raycast/extensions`, `extensions/google-translate` (the ROADMAP named
`gebeto/translate`, which does not exist on GitHub — that was wrong). Pulled to
`/tmp/opencode/audit/google-translate`, 35 files, of which 8 are source.

The user asked for it directly: Google Translate, nothing to run locally. That
overrides the ROADMAP entry, which had proposed standing up Lingva.

## What it is

Six commands and a language-set manager, over one vendored copy of
`iamtraction/google-translate`:

| Command | File |
| --- | --- |
| Translate | `src/translate.tsx` |
| Quick Translate | `src/quick-translate.tsx` |
| Instant Translate | `src/instant-translate.tsx` |
| Instant Translate: View | `src/instant-translate-view.tsx` |
| Instant Translate: Copy | `src/instant-translate-copy.tsx` |
| Instant Translate: Paste | `src/instant-translate-paste.tsx` |
| Manage Language Sets | `src/LanguagesManager/` |

Dependencies: `@raycast/api`, `@raycast/utils`, `google-tts-api`,
`https-proxy-agent`, `undici`. Platforms: macOS, Windows.

## The endpoint answers. Two of my earlier claims were wrong.

**Wrong #1 — "Google is 429".** Measured 2026-10-01:

| Request | Answer |
| --- | --- |
| `translate.googleapis.com/translate_a/single?client=gtx&…` | `429` |
| `translate.googleapis.com/translate_a/t?client=dict-chrome-ex&…` | `200`, shape `["привет"]` |
| `translate.google.com/translate_a/single?client=dict-chrome-ex&…` | `200`, the full 14-slot shape |

The 429 is specific to `client=gtx`, not to Google. The endpoint the extension
actually uses is a different host from the one I tested first time, and it works.

**Wrong #2 — "the token is needed".** The vendored `tokenGenerator` fetches
`https://translate.google.com`, greps `tkk:'…'` out of 3 MB of HTML, hashes the
text with it, and appends `&tk=`. The grep **finds nothing** — Google dropped it.
So `TKK` stays `"0"`, the hash is computed from zero, and the request goes out
with a meaningless token. It works without one: `200` on a request with no `tk`
at all. The whole file goes.

## What it is measured to return

`dt` decides what comes back. Measured on `q=hello&sl=en&tl=ru`:

| `dt` | slots filled |
| --- | --- |
| `t` | translations, detected language |
| `t,bd` | + dictionary |
| `t,at` | + examples |
| the full set | all 14 |

```jsonc
[0]  [["привет","hello",null,null,10], [null,null,"privet","həˈlō"]]
[1]  [["глагол", ["здороваться","звать","окликать"], [["здороваться",["greet","hello",…],null,0.0028], …]]]
[2]  "en"                       detected source
[3]  null                       phrases
[5]  [["hello",null,[["привет",…],…],[[0,5],…]]]      examples
[7]  []                         did-you-mean / autocorrect of the source
[8]  [["en"],null,[1],["en"]]   detected source, alternative slot
[12] [["восклицание",[["used as a greeting…","m_en_gbus0460730.012","hello there, Katie!"]],"hello",17], …]
[13] [[["<b>hello</b> there, Katie!",null,null,null,null,"m_en_gbus0460730.012"]]]
```

Ten parallel requests, all `200`. Long text: `POST` with `q` in the body works at
2700 characters, so the 2048-character URL threshold is real and has to be
honoured. There is no language list on this endpoint — `type=langs` is `400` — so
the table is static, as upstream already has it.

## The two things the user complained about

### "Quick matches fall"

Not a network problem. **No `List.Item` in the whole extension passes
`keywords`.** The search bar is bound to the text being translated
(`searchText={text}`), so the built-in filter is applied to the *results* against
the *query*. The rows are titled with the translation, so typing English filters
out every Russian row and the list goes empty as you type. It works for a
pasted selection and breaks for typing.

One `keywords={[source, translation]}` fixes it. Upstream also does not put the
source text anywhere visible — not in the title, not in the detail, not in the
markdown. The detail panel shows the translation twice.

### "The result is not rich enough"

It uses `body[0]` and `body[0][1][2]`, the transliteration, and nothing else. The
dictionary with per-synonym confidence, the examples, and the definitions with
their example sentences are all in the response and thrown away.

## Other defects worth not carrying over

| | |
| --- | --- |
| `langFrom.name` at `translate.tsx:80` and `:153` | no optional chaining, while the next line uses `langFrom?.name`. An unknown detected code throws and takes the whole command down. Every language label goes through `asLanguage` here |
| `DoubleWayTranslateItem` and `MultiTranslateItems` | `translate.tsx:57-128` and `:130-201`, ~95% identical, copy-pasted |
| `playTTS` | downloads to the fixed path `/tmp/translation.mp3` and plays it with **`afplay`**. macOS only, and two concurrent plays fight over one file |
| `google-tts-api` | a dependency, for one `getAudioUrl` call |
| The language list | pasted into the manifest **twice**, once per `lang1` and `lang2`, ~130 entries each. The manifest is 3 200 lines, mostly dropdown data |
| `tokenGenerator` returning an `Error` | on failure it *returns* the error instead of throwing, and the caller then sends `undefined=undefined` in the query |
| `doubleWayTranslate` | on auto-detect, translates back into the source language and shows the round trip as if it were a second result |
| `useCachedState` × 4 | four separate pieces of cached state for language sets that nothing requires |

## What shipped, and what that cost

**There is no port.** `google-translate/` is upstream, deployed. `src/` and
`vendor/` came from `raycast/extensions` and three files differ: `rich.ts` is new,
`simple-translate.ts` gained five lines, `translate-form.tsx` is the rest. Verified
with `diff -r`.

That was arrived at the expensive way. A port was written first — six commands, the
same structure, ~1400 lines — and its two list commands never displayed a
translation. Eleven commits went into that, and none of them found the fault,
because the fault was not in the port.

Vicinae resolves `@raycast/api` and `@raycast/utils` at runtime, which was known:
`github/` in this repo already mixes `@vicinae/api` with `@raycast/utils`. Upstream's
own source therefore runs unchanged, and it does — all six commands, first try. The
lesson is in `AGENTS.md` now, and the short version is that a port is the wrong tool
when the runtime can execute the original.

### The three changes on top

| | |
| --- | --- |
| `rich.ts` + five lines in `simple-translate.ts` | slots 1, 5, 7 and 12 parsed out of the `raw` response the reference already asks for, and shown in the form |
| memoised `usePromise` argument in `translate-form.tsx` | without it the form translated once and never again |
| the `Translation` field made properly controlled | it is an input, not an output, and its `value` prop stopped driving it |

Plus one action: **Refresh Translation**, `ctrl+R`, which submits the form so the
value in the Text field reaches the component and the translation re-runs. Nine
checks in `test/rich.test.ts`, against bodies captured from the endpoint.

## Still unverified

In `UNVERIFIED.md`: the language dropdown in the search bar — `ctrl+P` does not
search and the arrows stick after scrolling — and the three Instant commands, whose
clipboard dependency returns nothing usable on this Wayland setup.
