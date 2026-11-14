# Webapp Maker

Turn a website into a Chromium-family web app with its own desktop entry. Helium,
Chromium, Thorium, Brave and Chrome, through `--app`.

## Commands

| Command | Does |
| --- | --- |
| Create Webapp | name, URL, extra flags and an optional icon |
| Manage Webapps | list, edit, rename and remove what was created |

An empty icon fetches the site's touch icon, then `/apple-touch-icon.png`, then
Google's favicon service; whatever comes back must really be an image, or it is
refused. A theme icon name needs no file. A name that already exists is refused,
not overwritten.

## Preferences

| Preference | Default | Notes |
| --- | --- | --- |
| Browser Backend | auto-detect | Helium, Chromium, Thorium, Brave, Chrome |
| Environment File | empty | `KEY=VALUE` lines for `curl` when an icon is downloaded; not read at launch |

## Keys

`Cmd+E` edits a row, `Cmd+X` removes it.

## How it installs

A launcher script goes into the extension's support directory so the browser is
resolved at launch time. Desktop entries are written to
`~/.local/share/applications/`, icons to
`~/.local/share/icons/hicolor/256x256/apps/`. Only entries whose `Exec` uses that
launcher are removed, and a rename moves the icon with the app.

Ported from the Noctalia [`webapp-maker`](https://github.com/noctalia-dev/community-plugins/tree/main/webapp-maker)
plugin (MIT) by [umedbazarov](https://github.com/UmedjonBA); edit, rename and
remove are additions here.
