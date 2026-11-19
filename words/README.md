# Word

One command, one screen: type a word and read what it means, with the words
that sit next to it. The list row is the word itself; the pane shows the
phonetic, every sense by part of speech, an example where the dictionary has
one, and the synonyms and antonyms of each sense. Under the word comes a section
of related words for the mode picked in the search bar.

## Modes

| Mode | Asks | Answers |
| --- | --- | --- |
| Meaning | dictionary, then synonyms | senses with examples, plus the synonyms |
| Slang | Urban Dictionary `v0/define` | user-written definitions of the word, each with its example, author and date |
| Synonyms | Datamuse `ml` | words close in meaning, with their definitions |
| Antonyms | Datamuse `rel_ant` | opposites |
| Rhymes | Datamuse `rel_rhy` | rhymes |
| Sounds Like | Datamuse `sl` | homophones and near-homophones |
| Adjectives | Datamuse `rel_jjb` | adjectives that commonly describe the word |
| Spelling | Datamuse `sp` | words matching a pattern: `s??a?t`, `*he*o` |

Enter on a related word copies nothing by accident: it looks that word up in
place. Copy, paste and the Merriam-Webster article are separate actions.

## Sources

- **Definitions and examples** — `api.dictionaryapi.dev`, Wiktionary senses.
  Free, no key, no account.
- **Related words** — `api.datamuse.com`. Free, no key.
- **Slang** — `api.urbandictionary.com/v0/define`. Free, no key, undocumented.
- **Merriam-Webster** — the "Open on Merriam-Webster" action goes to the
  dictionary article, where the examples are fuller. A slang row opens its own
  Urban Dictionary permalink instead.

Every word you type is sent to both services; nothing else leaves the machine,
and nothing is written to disk.

## What the data does not guarantee

Measured 2026-11-19:

- `example` is filled for some words and empty for others: `ran` came back with
  19 examples, `obfuscate` with 2, `serendipity` with none. The pane simply
  omits the line; it never invents one.
- Datamuse antonyms are thin: `rel_ant=ephemeral` returned no words at all,
  while the dictionary entry carried four. That is why antonyms are also shown
  per sense, from the dictionary.
- Rhymes are sparse for long words (`rel_rhy=ephemeral` answers one word), so an
  empty rhyme section is normal rather than broken.
- Merriam-Webster answers **403** to every request from this machine, including
  plain `curl`, so its article is only reachable through the browser action.
  The extension does not scrape it.
- Urban Dictionary answers `200` with an empty list for a term it does not
  know, so an empty Slang section means the word is not there, not that the
  request failed. Its votes are **not** usable: `thumbs_up` and `thumbs_down`
  came back `0` for every record measured, so rows keep the order the service
  sent instead. Definitions are user-written and arrive with their author's
  spelling, profanity and mistakes; only the service's `[cross-links]` are
  stripped.
- The Slang section turns the builtin filter off: every row is a definition of
  the same word, none of which contains the word, so filtering would hide them.

## Development

```bash
npm install
npm run dev     # hot reload; logs to this terminal
npm run build   # type-check and install
npm test        # self-checks against saved answers from both services
```

Open it with:

```bash
vicinae 'vicinae://launch/@black/words/lookup'
```

`test/fixtures/` holds the two services' answers as saved on 2026-11-19; the
checks read them, so a change in the code that stops reading what the services
send turns red without a network call.
