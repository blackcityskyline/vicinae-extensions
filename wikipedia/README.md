# Wikipedia

Search Wikipedia, read an article without leaving the launcher, and follow the
links inside it. Port of the Raycast extension by
[vimtor](https://www.raycast.com/vimtor/wikipedia), same commands and same reader.

## Commands

| Command | Mode | Does |
| --- | --- | --- |
| `Search Page` | view | Search by title; recent articles when the field is empty |
| `Open Page` | view | Read one article; takes `title` as an argument |
| `Random Page` | no-view | A random article, in the launcher or the browser |
| `Featured Page` | no-view | Today's featured article, same choice |

`Search Page` keeps the last 20 articles per language in the cache, most recent
first, and offers to delete one or all from the row's actions.

## Preferences

| Preference | Where | Values |
| --- | --- | --- |
| Open In | extension | `Launcher` (default) or `Browser` |
| View Type | `Search Page` | `List` (default) or `Grid` |

`Open In` decides where the reader opens an article and where a link inside it
leads; the command itself only changes the order of the first two actions.

## Keybindings

| Action | Shortcut | Where |
| --- | --- | --- |
| Open in Browser | `open` | row, reader |
| Show Details | ctrl+d | row |
| Search in Browser | ctrl+shift+f | row |
| Copy URL / Title / Subtitle | `copy` / `copy-name` / `copy-path` | row, reader |
| Delete Recent Article / All | `remove` / `remove-all` | row |
| Show / Hide Metadata | ctrl+m | reader |
| Change Language | ctrl+shift+l | reader |
| Open Link | ctrl+l | reader |
| Back / Forward | alt+left / alt+right | reader |
| Copy Summary / Contents | ctrl+alt+s / ctrl+alt+c | reader |

Open, copy and delete use the named shortcuts, so the user's own `keybinds` set
them. Their defaults already take `ctrl+shift+.` and `ctrl+shift+,`, so the two
copy-the-article actions sit on `alt`; the rest are the extension's own keys.

Raycast binds back/forward to bare `[`/`]`; they sit on `alt`+arrow keys here.

The reader keeps its own history: back and forward move through the articles
opened inside it, back from the first article pops the view, and following a link
after stepping back drops what was ahead.

## Pages and the deeplink

An article inside an article opens with
`vicinae://launch/@black/wikipedia/open-page?fallbackText=<title>`, not a
`vicinae://extensions/...` link: Vicinae 0.29 and 0.30 reject a command deeplink
that carries arguments (`Failed to execute deeplink: Usage:
vicinae://extensions/<author>/<extension-name>`), and `fallbackText` is the one
query parameter it forwards. `Open Page` therefore reads
`arguments.title ?? fallbackText`. The author and extension slugs in
`src/utils/links.ts` and in the manifest move together.

## AI tool

`Search Article` is the ported Raycast tool: the model sends a query (and
optionally a wiki code), gets back the best article as markdown, its metadata and
the titles of the other matches, so a failed question can be searched again in
other words. Vicinae turns the function's JSDoc and its TypeScript input type
into the tool's description and JSON schema at build time, so both are written
for a model, not for a reader.

Chats and Quick AI can use it as soon as the configured model supports tool
calling; it is listed under the extension's tools in the AI settings, where it
can be allowed or set to ask for approval. Needs Vicinae 0.30 or newer, and
`@vicinae/api` 0.30.1 — the 0.29 line validates `tools` in the manifest but does
not bundle `src/tools/`.

## What the port changed

- `node-fetch` dropped: the runtime is Node, so `fetch` with
  `AbortSignal.timeout(15s)` does the job. `wikijs` and `dedent` are kept.
- The tool's language argument is optional and falls back to the language picked
  in the launcher, which the model cannot know. It asks Wikipedia for 5 results
  instead of upstream's 1: that one left the "other matches" list always empty.
- Per-platform shortcut objects replaced by named ids as above. The grid passes
  `fit` through a spread, since the shared `List` component has no such prop.
- The user agent identifies the launcher, not Raycast, and carries a contact URL
  — Wikimedia rate-limits clients that do not name themselves.
- A reader opened without a title records nothing as recent: the deeplink path
  used to land a keyless row that React then silently dropped.
- Rows of search results are keyed by page id, as upstream; the empty search has
  a "No pages found" view naming the language instead of a blank list.
- Upstream bug fixes: `replaceLinks` no longer brackets the whole text on
  articles without links (an empty alternation matched every word boundary);
  nested sections propagate `openLinksInBrowser`; a child-only parent section
  is kept (real: Berlin's `History`); `substr`→`slice`, `replaceAll`→`replace`
  (es2020 target); repeated React keys made unique.

## Not verified

- `Search in Browser` (ctrl+shift+f): the URL it builds is checked, the press was
  not.
- A page whose summary request fails: it should toast and pop to the root.

The tool was called through `vicinae mcp`, the same tool registry the chat uses,
with `{"query": "Belarusian language"}` and with `{"query": "Мінск", "language":
"be"}`; the second returned the Belarusian article plus four other Minsk pages.
A chat model driving it was not exercised.

Checked by pressing the keys against a running launcher: search results and their
subtitles in both list and grid, `Show Details` from a row, the metadata pane,
`Open Link` into another article, the language submenu switching to the German
article, back and forward, both copy actions (read back from the clipboard, body
sections and nested headings included), `Open in Browser` (a `Berlin - Wikipedia`
tab), `Delete Recent Article`, `Open Page` by argument and by `fallbackText`,
`Random Page` and `Featured Page` through to the reader, `Open In: Browser`
(`Random Page` opened a tab instead of the reader), and `wikijs` against
`en.wikipedia.org` (16 sections, nested items, 1490 links, metadata).
