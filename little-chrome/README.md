# Little Chrome

Open a URL or a Google search in a small, chromeless window of your browser,
with suggestions from your own history underneath. Like Little Arc, but for any
Chromium-family browser.

Ported from the Raycast extension by [tompenguin](https://github.com/tompenguin).

## Requirements

- A Chromium-family browser on `PATH`: Helium, Chromium, Thorium, Brave or Chrome.
  `--app` mode is what makes the window chromeless.
- `sqlite3` for history suggestions; without it windows still open and the list
  says what is missing.

## Commands

| Command | Does |
| --- | --- |
| Open Little Chrome | type a URL or search; the first row is what you typed, history matches follow |
| Open URL in Little Chrome | the same for a hotkey or script, without suggestions |
| Manage Hidden Suggestions | review and unhide hidden pages and sites |

An input with a scheme opens as is; one with whitespace is a Google search;
`localhost`, `127.0.0.1`, `[::1]`, `*.localhost` and `*.test` get `http://`;
other domains get `https://`; anything else is a search.

## Preferences

| Preference | Default |
| --- | --- |
| Browser | auto-detect (first installed) |
| Window Width | 900 |
| Window Height | 700 |

## Hiding suggestions

`Ctrl+X` hides a page, `Ctrl+Shift+X` hides its site. Hidden entries are kept per
browser and profile in local storage, never in the browser's history; both
actions offer undo.

## Network

None. History is copied to a temp file and queried locally; favicons go to the
extension's support directory.

## Differences from upstream

Enter opens the first row (what you typed), because Vicinae cannot pin the
selection to the first history match; the best match sits directly below.
**Copy Chrome URL** and **Open in Current Tab** are dropped: reading another
window's active tab needs keystrokes that cannot be verified or a browser
restart with a debugging port.

## Not verified

Only Helium and Brave were launched; Chromium, Thorium and Chrome paths are the
conventional ones. Window size and placement are the browser's and the
compositor's. Multi-profile selection beyond `Default` is covered by unit checks.
