# Downloads Manager

Search and organize your downloads. Deployed from
`raycast/extensions/extensions/downloads-manager` as it stands: seven commands,
nine preferences, list and grid.

## Delete latest from a deeplink

```sh
vicinae -g 'vicinae://extensions/black/downloads-manager/delete-latest-download?launchType=background'
```

In Trash mode it runs immediately. Permanently Delete needs a foreground
approval first; after that the background deeplink can delete without a prompt,
while foreground permanent deletion still asks every time. Cancelling a
foreground permanent deletion disables the background path again. **Toggle
Deletion Behavior** switches modes.

## Differences from the reference

- The trash is `gio trash`, not the API's `trash()`, which is `rm -r`: upstream
  would delete permanently while reporting the trash.
- Four shortcuts were reshaped from `{macOS, Windows}` to `{modifiers, key}`,
  which is what Vicinae reads; in the reference form they bound nothing.
- **Toggle Quick Look** is gone: it is macOS-only and `@vicinae/api` has no
  thumbnailer. Text preview still works.
- `keywords` were added to every row, so `otchet` finds `Отчёт (2).pdf`.
- The six AI tools in `src/tools/` are not deployed: the manifest has no `tools`
  key.

`Add Time` sorting can shift after a preview or a `stat`, because `/home` here is
btrfs with `relatime`; the setting is upstream's and is kept.
[`docs/audits/downloads-manager.md`](../docs/audits/downloads-manager.md) has the
rest.
