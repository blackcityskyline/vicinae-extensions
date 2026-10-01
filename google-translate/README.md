<p align="center">
    <img src="./assets/google-translate.png" width="150" height="150" />
</p>

# Google Translate

> Deployed upstream, unchanged, with one addition: `translate-form` now shows what
> the endpoint already sends and the reference discards. Everything else is
> `raycast/extensions` at `extensions/google-translate`, byte for byte —
> `diff -r src vendor` against the upstream tree is the check.

## What was added to `translate-form` only

`translate()` is already called with `raw: true`, so the whole response — a
positional array of fourteen slots — is in hand. The reference reads slot 0 for the
translation and slot 0's second entry for the transliteration, and ignores the
rest. The form now also shows:

| Field | Slot |
| --- | --- |
| Corrected | 7, the typo correction, with the `<b><i>` markup dropped |
| Synonyms | 1, grouped by part of speech, ordered by the score Google gives each |
| Also | 5, the other renderings of the same word |
| Definitions | 12, in English, with their example sentences |

Plus "Copy Synonyms" and "Copy Definitions". Every field is omitted when it is
empty: a translated paragraph comes back with three slots and no dictionary, and
that is the normal case, not an error.

`vendor/` is untouched. `test/rich.test.ts` pins the shapes against bodies captured
from the live endpoint.

---

This extension provides quick access to Google's Translate service.

## 🔧 Features

- **Quick Translation**: Translate text quickly and easily.
- **Language Sets**: Create your own translations sets.

## ⚙️ Configuration

- **Proxy**: Set an optional custom HTTP proxy URL for translation requests.
