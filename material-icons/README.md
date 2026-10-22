# Material Icons

Search and preview Google's Material Icons, copy the name or codepoint, download
an asset.

| Command | What it does |
| --- | --- |
| Search Material Icons | Grid or list of the catalogue, with a style dropdown in the grid |

Preference: **Preferred view** switches between grid and list.

## Ported from Raycast

Upstream, MIT: [creasty/material-icons](https://github.com/raycast/extensions/tree/main/extensions/material-icons).

### What changed

**`fzy.js` is replaced by a subsequence matcher.** `src/icons.ts` has the whole
search: `alrm` still finds `alarm`, name matches sort before tag matches. No
dependency, and the ranking is simpler than fzy's (no word-boundary bonus).

**Frecency sorting is gone.** Upstream reorders the grid by how often an icon
was used, through `useFrecencySorting`. The catalogue is alphabetical here.

**One page at a time.** The grid opens with 60 icons, the list with 100, and
both ask for the next page when scrolled. Filtering is ours (`filtering={false}`)
so the query still covers the whole catalogue rather than the loaded page.

**The style menu is flat.** Vicinae's action panel has no `Submenu`, so the five
styles are actions in an **Icon Style** section instead of a nested menu.

**Download says where the file went.** The toast carries the full path. Vicinae
exposes `showInFileBrowser` at runtime but not in the Raycast-compatible type
surface this repo type-checks against, and a toast has no action button, so the
file browser is not opened automatically. Files land in `~/Downloads`.

**The catalogue is cached for a day.** One request to
`fonts.google.com/metadata/icons`, then the parsed list is reused. The response
starts with an anti-hijacking line, which `parseMetadata` removes before
`JSON.parse`.

## What leaves your machine

One GET to `fonts.google.com`, once per day. Downloads go to
`fonts.gstatic.com`. Copy actions never send anything.
