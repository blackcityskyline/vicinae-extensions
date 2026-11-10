# Default Apps

See and change the default application for browsing, mail, files, media and
documents. Reads and writes through `xdg-mime`, so the choice applies to every
program that opens links and files the standard way.

| Command | What it does |
| --- | --- |
| Manage Default Apps | One row per category with the current default. **Set Default** lists the applications that can handle it; `ctrl+R` rescans |

Categories: web browser, mail, calendar, file manager, music, video, images, text
editor, PDF viewer, archive manager, word processor, torrent. A category sets all
of its types at once (the browser sets `http` and `https`, music sets MP3, FLAC,
Ogg and WAV).

```sh
vicinae 'vicinae://launch/@black/default-apps/manage'
```

## Requirements

`xdg-utils` (`xdg-mime`). Without it the command says so and offers a retry.

## How it decides

- **Which applications are offered.** Those whose desktop file declares at least one
  type of the category and, for most categories, one of its menu categories
  (`Email` for mail, `Audio`/`Music`/`Player` for music, and so on). Browsers are
  offered only as browsers: they register for nearly every type.
- **Where it looks.** `$XDG_DATA_HOME`, every entry of `$XDG_DATA_DIRS`, Flatpak's
  exports, and Guix profiles, so systems that keep applications outside `/usr`
  (NixOS, Guix) work. A file in an earlier directory hides the same name in a later one.
- **A change is checked.** `xdg-mime default` exits 0 even for an application that does
  not exist, and it writes the name into `mimeapps.list` regardless. After setting, the
  extension reads the answer back and reports a mismatch as a failure. `xdg-mime` itself
  only reports an application whose `Exec` binary is on `PATH`, so an entry whose program
  is missing is refused the same way.
- **"Types disagree"** appears when the types of one category have different defaults,
  which happens when one was changed elsewhere. Setting the category again aligns them.
- **Icons.** The Set Default list shows the icon the launcher already resolved for each
  desktop file, including ones from your own icon theme. The current default keeps the
  checkmark; an application the launcher has no icon for keeps the generic one.

## Credits

Ported from the Noctalia
[`default-apps`](https://github.com/noctalia-dev/community-plugins/tree/main/default-apps)
plugin (MIT) by [Thaer99ob](https://github.com/Thaer99ob); the discovery of desktop
entries on non-FHS systems follows the upstream fix by oldirtty (#774).

Not ported: the Noctalia bar widget and the `apps` launcher provider; the launcher
itself is this extension's list.

## Development

```bash
npm install
npm run dev     # build, install and watch
npm run build   # type-check, bundle, install
npm run lint    # validate the manifest
npm run check   # tsc --noEmit with noUnusedLocals
npm test        # self-checks; one round trip runs the real xdg-mime when it is installed
```

## Not verified

No Vicinae runtime was available when this was written: the list, the submenu and the
toasts were never rendered. The `xdg-mime` behaviour above was measured on `xdg-mime`
1.1.3 with no desktop environment detected; desktop-specific back ends (KDE, GNOME's
`gio`) answer through their own tools and were not run.
