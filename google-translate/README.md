# Google Translate

Quick translation through Google's translate endpoint, with language sets.

Deployed from `raycast/extensions/extensions/google-translate` unchanged apart
from one addition: **Translate Form** now shows what the endpoint already sends
and the reference discards. `diff -r src vendor` against upstream is the check.

## Commands

| Command | Does |
| --- | --- |
| Translate | translate text between the two configured languages |
| Translate Form | the same, plus the dictionary slots below |
| Quick Translate | translate into several languages at once |
| Instant Translate Copy / Paste / View | translate the selection and copy, paste or show it in a HUD |

## The form's extra fields

`translate()` already runs with `raw: true`, so the whole positional response is
in hand. Beyond slot 0 (translation and transliteration):

| Field | Slot |
| --- | --- |
| Corrected | 7, the typo correction, markup dropped |
| Synonyms | 1, grouped by part of speech, ordered by Google's score |
| Also | 5, other renderings of the same word |
| Definitions | 12, in English, with examples |

Empty fields are omitted: a translated paragraph comes back without a dictionary,
which is the normal case. **Copy Synonyms** and **Copy Definitions** use them.
`vendor/` is untouched and `test/rich.test.ts` pins the shapes against captured
live bodies.

## Preferences

Source and target languages, the two extra languages for Quick Translate,
auto-input, the default action, cross-language priority, and an optional HTTP
proxy.
