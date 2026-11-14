# Bible

Search Bible passages by reference across 233 versions, including the Russian
Synodal, and open a random chapter.

| Command | Does |
| --- | --- |
| Bible Search | passages by reference, e.g. `John 3:16`; takes optional `ref` and `version` arguments |
| Random Passage | a random chapter of the selected version |

The search preferences toggle between one passage and several, verse numbers,
copyright, references, and one verse per line. Text comes from
`biblegateway.com`, read from the passage page's `data-osis` and verse classes
rather than the table the site no longer renders. Russian book names are
translated before the query; chapter numbering stays the site's.

Needs the network, nothing else. Deployed from
[josmithua/bible](https://github.com/raycast/extensions/tree/main/extensions/bible)
with the parser replaced; [`docs/audits/bible.md`](../docs/audits/bible.md) has the
measurements.
