# Little Chrome

Open a URL or a Google search in a small, chromeless window of your browser,
with suggestions from your own history underneath. Like Little Arc, but for any
Chromium-family browser.

Ported from the Raycast extension by [tompenguin](https://github.com/tompenguin);
what changed and why is in [`docs/audits/little-chrome.md`](../docs/audits/little-chrome.md).

## What it needs

- A Chromium-family browser on `PATH`: Helium, Chromium, Thorium, Brave or
  Chrome. `--app` mode is what makes the window chromeless.
- `sqlite3` on `PATH` for history suggestions. Without it, windows still open;
  the list explains what is missing.

## Commands

| Command | What it does |
| --- | --- |
| **Open Little Chrome** | Type a URL or search. The first row is what you typed, resolved and shown as a subtitle; matches from your browser history follow it. `Enter` opens the selected row. |
| **Open URL in Little Chrome** | The same, for a hotkey or a script, without the suggestion list. |
| **Manage Hidden Suggestions** | Review hidden pages and sites and unhide them. |

Typing rules: an input with a scheme (`https://…`, `chrome://…`, `mailto:…`) is
opened as is; addresses with whitespace are a Google search; `localhost`,
`127.0.0.1`, `[::1]`, `*.localhost` and `*.test` get `http://`; other domains
and IP addresses get `https://`; everything else is a search.

## Preferences

| Preference | Default | Description |
| --- | --- | --- |
| Browser | Auto-detect | Which browser opens the windows and which one's history is read. Auto takes the first installed one. |
| Window Width | 900 | Pixels. |
| Window Height | 700 | Pixels. |

## Hiding suggestions

`Ctrl+X` on a history row hides that page, `Ctrl+Shift+X` hides the whole site.
Hidden entries are kept per browser and profile in Vicinae's local storage and
never touch the browser's history. Both actions offer an undo, and
**Manage Hidden Suggestions** lists everything that is hidden.

## What leaves the machine

Nothing. History is copied to a temporary file and queried locally; favicons are
written into the extension's support directory. No network request is made by
this extension.

## Differences from upstream, and what was dropped

- `Enter` opens the first row, which is what you typed, because Vicinae's `List`
  cannot pin the selection to the first history match the way Raycast can. The
  best history match is the row directly underneath.
- **Copy Chrome URL** and **Open in Current Tab** are gone. Both need the active
  tab's URL of a browser window this extension did not open, and on Linux that
  is only readable by typing into that window (which cannot be verified, so a
  miss lands in another application) or by restarting the browser with a
  debugging port. See the audit for the full reasoning.

## Not verified

- Chromium, Thorium and Chrome were never launched: only Helium (`helium-browser`)
  and Brave (`brave`) are installed on the machine this was written on. Their
  binary names and history directories are the conventional ones.
- The window is opened, but how it is sized and where it is placed is decided by
  the browser and the compositor.
- No multi-profile browser was available, so profile selection beyond `Default`
  is covered by unit checks only.
