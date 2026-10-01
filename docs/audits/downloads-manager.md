# Audit: `downloads-manager` → upstream deployed, three measured fixes

Source: `raycast/extensions`, `extensions/downloads-manager` — author `thomas`,
eleven contributors. Thirty files, 679 lines in `src/utils.tsx` alone.

**A port existed here and was wrong.** 4 files, 1 command, 1 preference. Upstream is
7 commands, 9 preferences, 2 layouts, 4 sort orders, pagination, a detail pane with
text preview, a per-item trash that remembers its confirmation, and a background-launch
path. The port was a fraction of the original written from scratch. Replaced.

## What ships

Upstream `src/`, deployed. Four files differ from the tree, all of them measured:

| File | Change |
| --- | --- |
| `src/trash.ts` | **new.** `gio trash` instead of the API's `trash()` |
| `src/utils.tsx` | `moveToTrash` rewritten over it; `keywordsFor` added; Finder path removed |
| `src/manage-downloads.tsx` | four shortcuts reshaped; `ToggleQuickLook` dropped; `keywords` per row |
| `src/show-latest-download.tsx` | window closed **before** the file is revealed |
| `src/paste-latest-download.tsx` | window closed **before** the paste |
| `package.json` | `platforms`, scripts, author, `label` dropped from four dropdowns |

`src/tools/` is upstream's six AI tools. Vicinae's manifest has no `tools` key, so
nothing would have read them; they are not deployed rather than shipped dead.

## The finding that mattered

**Vicinae's `trash()` is `rm -r`.** From the installed `dist/api/utils.js`:

```js
const trash = async (path) => {
  const targets = Array.isArray(path) ? path : [path];
  const promises = targets.map((p) => rm(p, { recursive: true }));
  await Promise.all(promises);
};
```

Upstream's `deleteFileOrFolder` wraps it and then says `Item Moved to Trash`.
Deployed as it stands, every delete action in the extension — including `Delete All
Downloads` — would remove files permanently while reporting that they went to the trash,
which is the exact outcome the feature exists to prevent.

`gio trash` is the freedesktop implementation, installed at `/usr/bin/gio`. Measured:

```
gio trash ~/Downloads/probe.txt    ->  exit 0, gone from ~/Downloads,
                                         ~/.local/share/Trash/files/probe-trash.txt
                                         ~/.local/share/Trash/info/probe-trash.txt.trashinfo
```

Verified end to end on a file named `Скачанный файл (1).txt`: gone from the folder,
present and readable in the trash with its content intact.

`gio` refuses a system-internal mount — `Trashing on system internal mounts is not
supported`, verified on `/tmp`. That is a refusal, not a deletion, so it is surfaced
with the path and the reason.

Upstream's fallback for the same problem is an AppleScript that drives Finder, because
Raycast's Trash API fails on iCloud-backed Downloads folders. Neither iCloud nor Finder
exists here, so the whole branch is gone.

### The batch split

`moveToTrash` returns which paths went and which did not, from gio's own exit status per
path. It does not decide by checking afterwards whether the file is still on disk: a
row that was never there passes that test and gets reported as trashed. One check pins
it — a batch of one real file and one missing path returns `trashed: [real]` and
`failed: [missing]`.

Each path is a separate call, so one refusal does not abandon the rest.

## What else did not survive the platform

| Upstream | Here | Why |
| --- | --- | --- |
| `Action.ToggleQuickLook` | removed | Quick Look is a macOS framework. Typed `(props: any) => null` in Vicinae — it renders nothing and does nothing. The preview it toggled is already in the detail pane |
| `{macOS: {...}, Windows: {...}}` shortcuts ×4 | `{modifiers: [...], key}` | Vicinae's `Shortcut` is `{key, modifiers}`. The per-platform object is a different shape; those four actions arrived with no shortcut bound at all |
| `AppleScript` → Finder trash | removed | macOS only |
| `qlmanage` thumbnails | returns `null` | macOS only. Text preview works — it is plain `read` |

## Focus order, in two commands

`show-latest-download` revealed the file first and closed the launcher afterwards, and
the user reported that nothing happened. The same order in `paste-latest-download` pastes
into a window that does not yet have focus.

Vicinae itself orders these the other way round. `Action.Paste`:

```js
closeMainWindow(); // we close before pasting to make sure focus has been properly restored
Clipboard.paste(content);
```

Measured on this machine, with Nautilus running and holding three `Downloads` windows:

| | |
| --- | --- |
| `ShowItems` on a folder with **no** window open | a window appears with that folder's name, and it is the right one |
| `ShowItems` on a folder whose window is **already** open | window count unchanged, active window unchanged |
| the command, before the fix | ran in 0.024 s, opened nothing |

`ShowItems` on an already-open folder is a no-op on the compositor's visible state, so
relying on it to bring a window forward is what fails. Closing the launcher first leaves
the compositor free to hand focus away, which is what the comment in `Action.Paste`
describes.

`copy-latest-download` copies to the clipboard and passes focus to nothing, so its order
was left alone. `open-latest-download` opens a window and has the same shape as the two
fixed, but it was not reported and not measured — it is listed below.

The check that keeps this from regressing reads the call order out of the source: a
command that hands focus to another window must close the launcher first.

## `keywords`

Upstream passes `keywords` on nothing, in any view. A list filters rows against the text
typed in the search bar, so a row titled `Отчёт (2).pdf` is not found by `otchet`, and
nothing answers to `pdf` at all. `keywordsFor` adds the full name, the stem, the stem
without a repeat counter, the extension in both cases, `file` or `folder`, and the size
or item count.

## Preferences, verbatim

4 global and 5 command-level, names, types, defaults and order all upstream's. The one
schema edit: `label` is not a recognised key on a dropdown in Vicinae, so it is dropped
from the four dropdowns and kept on the two checkboxes, where it is the visible text.

## stat fields, measured on this machine

`/home` is btrfs, and the three timestamps are distinct and correct:

```
old.txt    birth: 14:10:27.330  mtime: 14:10:30.350
newer.txt  birth: 14:10:29.347  mtime: 14:10:29.347
```

So `birthTime`, `createTime` and `modifiedTime` sorting all mean what they say.

One caveat worth recording: `atime` on this filesystem is `relatime`, and **reading a
file updates it**. `addTime` sorting is therefore unstable — the `fileOrder` and
`lastestDownloadOrder` settings offer `addTime`, and a preview or a `stat` of a download
can move it. Upstream's choice, kept as it is.

## The permission screen

`withAccessToDownloadsFolder` has a macOS branch pointing at System Settings and a
Windows branch. On Linux it falls to the second one, which says the path may be wrong and
offers `Action.ShowInFinder` — the correct behaviour here, since there is no permission
dialog on Linux. Unchanged.

## Verified

| | |
| --- | --- |
| `lint`, `check`, `test`, `build` | clean; 27 checks |
| all 7 commands launched | loaded twice each, 0 crashes, stderr empty |
| trash, single | file gone from disk, present and readable in the trash |
| trash, directory | arrives with its contents |
| trash, two files named `dup.zip` | both survive |
| trash, name `it's "x"; rm -rf ~.txt` | arrives under its own name, no shell ran |
| trash, batch with a missing path | reports one trashed, one failed |
| `permaDel` | demands confirmation, then deletes, and does **not** appear in the trash |
| listing | newest first, dotfiles out, subdirectory reports its item count, a broken symlink does not collapse the listing |
| a row's path | never outside the folder it was read from |
| `ShowItems` with a correct `file://` URI | opens exactly the folder asked for |
| `ShowItems` with a bare path instead of a URI | opens the wrong place — the URI matters |
| focus order in `show-` and `paste-latest-download` | launcher closes first, in the built bundles too |
| all 7 commands after the reorder | load, no crash, stderr empty |

## Not verified

`UNVERIFIED.md`. The gap that matters: **nothing here was looked at.** All seven commands
were confirmed to load without a crash; nobody has seen the list render, the grid
toggle, the detail pane, or a text preview. The checks read files; they do not draw.

Quick Look has no Linux counterpart here and image previews are therefore absent. That
is a real reduction against the original, not a bug: there is no thumbnailer in
`@vicinae/api` to call.

**The focus fix is not confirmed by eye.** The launcher is a layer-shell surface and does
not appear in `hyprctl clients`, so no script can observe whether it held focus at the
moment the command ran. The measurement above is of Nautilus's behaviour from outside;
that the extension now hands focus away in the right order is read out of the built
bundle, not seen. Whether the file ends up selected inside the window is unproven —
Nautilus exposes no way to read its selection over D-Bus.

`open-latest-download` has the same ordering shape and was left as upstream wrote it. If
it turns out to open without focus too, the fix is the same one line.
