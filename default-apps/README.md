# Default Apps

See and change the default application for browsing, mail, files, media and
documents, through `xdg-mime` so the choice applies to every program that opens
links and files the standard way.

| Command | Does |
| --- | --- |
| Manage Default Apps | one row per category with the current default; **Set Default** lists the candidates, `ctrl+R` rescans |

Categories: browser, mail, calendar, file manager, music, video, images, text
editor, PDF, archive manager, word processor, torrent. A category sets all of its
types at once (browser sets `http` and `https`, music sets MP3, FLAC, Ogg and
WAV).

```sh
vicinae 'vicinae://launch/@black/default-apps/manage'
```

## How it decides

- Candidates are desktop files that declare at least one type of the category,
  plus a matching menu category for most of them. Browsers are offered only as
  browsers, since they register for nearly everything.
- It looks in `$XDG_DATA_HOME`, `$XDG_DATA_DIRS`, Flatpak exports and Guix
  profiles, so applications outside `/usr` are found; an earlier directory hides
  the same name in a later one.
- `xdg-mime default` exits 0 for an application that does not exist, so the
  choice is read back and a mismatch is reported as a failure; an entry whose
  binary is missing is refused.
- **Types disagree** appears when the types of one category have different
  defaults; setting the category again aligns them.

## Requirements

`xdg-utils` (`xdg-mime`). Without it the command says so and offers a retry.

## Not verified

No Vicinae runtime was available when this was written: the list, submenu and
toasts were never rendered. The `xdg-mime` behaviour was measured on 1.1.3 without
a desktop environment; KDE and GNOME back ends were not run.

Ported from the Noctalia
[`default-apps`](https://github.com/noctalia-dev/community-plugins/tree/main/default-apps)
plugin (MIT) by Thaer99ob, without the bar widget and its `apps` provider.
