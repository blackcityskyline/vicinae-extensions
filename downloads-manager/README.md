# Downloads Manager

One command: open the Downloads folder in the launcher and act on what is in
it.

| Action | Shortcut |
| --- | --- |
| Open (or open the folder) | `cmd+enter` |
| Show in File Manager | `cmd+o` |
| Open With | — |
| Copy File | `cmd+c` |
| Copy Path | `cmd+shift+c` |
| Move to Trash | `cmd+backspace` |
| Delete Permanently | `cmd+shift+backspace` |
| Reload | `cmd+r` |

Newest first. Hidden entries are left out. The folder is a preference and
defaults to `~/Downloads`.

## `trash()` is `rm -rf`, so this uses `gio`

`@vicinae/api` exports `trash()`, and its whole implementation is:

```js
const trash = async (path) => {
  await Promise.all(paths.map((p) => rm(p, { recursive: true })));
};
```

Nothing is recoverable afterwards. `Move to Trash` therefore shells out to
`gio trash`, which writes the `.trashinfo` record the desktop trash expects.
Verified against the real trash: the file disappears from the folder, appears
in `gio trash --list`, and gets its `.trashinfo`.

`gio` is part of `glib2`, present on any Arch system with a desktop. If it is
missing the action says so rather than falling back to deleting.

`Delete Permanently` is a separate action because `gio trash` refuses files on
an internal mount — `/tmp` is one — and a Downloads folder on such a mount has
no other way out.

## Deletion is guarded by where the path came from

Every destructive action asks `isInside` first, and it is not a `startsWith`:

```ts
const relativePath = relative(resolve(root), resolve(candidate));
return relativePath !== "" && !relativePath.startsWith("..") && !isAbsolute(relativePath);
```

Three things fall out of that. `/home/black/Downloads2/secret` starts with
`/home/black/Downloads` as a string and is a *different* directory. A path equal
to the folder is refused, so a bug that passes the folder itself cannot delete
it. And `..` is resolved rather than pattern-matched.

Checked live: asked to trash `/etc/hosts` and to delete the folder itself, both
refused with the reason, both files still there.

## Ported from Raycast

Upstream, MIT: [thomas/downloads-manager](https://github.com/thomas/downloads-manager)
— a fork of the extension by that name.

### What changed

**Seven commands became one.** Upstream ships a list plus six `no-view`
commands that all act on "the latest download": open, copy, paste, show, delete,
and a toggle for how delete behaves. Every one of them is an action on a row of
the list, and the list is one keystroke away — so the six commands are one
command with six actions. That is 890 lines of upstream down to about 200.

**Nothing is left to chance on macOS.** Upstream resolves the Downloads folder
through `system_profiler`, the Windows registry, or `~/Downloads` depending on
the platform, and has a whole permission-request screen for macOS full-disk
access. On Linux it is a preference, and `~/Downloads` is the default.

**Deletion always asks.** Upstream remembers "yes, move to trash" in
`LocalStorage` and afterwards deletes without asking. A remembered answer to a
destructive question is the wrong thing to keep, so both destructive actions
confirm every time.

### Dropped

- **Grid layout, list/grid toggle, detail toggle, pagination.** The list and
  the fuzzy filter handle a Downloads folder; a grid of icons is for a media
  library.
- **Quick Look thumbnails and text previews.** The Quick Look path shells out
  to `qlmanage`, which is macOS-only, and the text preview is a 100-line table
  mapping 45 extensions to syntax-highlighting languages.
- **Navigating into subfolders.** Extracted archives land as folders; opening
  one is an action, and keeping the deletion root the Downloads folder is worth
  more than a second level of navigation.
- **`Delete All Downloads`.** It is one keystroke away from deleting everything
  in a folder nobody has looked at.
- **The deletion-behaviour toggle.** With both actions visible there is nothing
  to toggle.
