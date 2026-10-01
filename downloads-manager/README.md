# Downloads Manager

Search and organize your downloads.

Upstream `raycast/extensions`, `extensions/downloads-manager`, deployed as it stands.
Seven commands, nine preferences, list and grid. `docs/audits/downloads-manager.md`
records every difference and why.

## Delete Latest Download via Deeplink

Use a background deeplink to delete the latest download without focusing Raycast:

```sh
vicinae -g 'vicinae://extensions/black/downloads-manager/delete-latest-download?launchType=background'
```

Trash mode runs immediately. Permanently Delete mode requires approving a foreground deletion before background deletion is enabled; after that approval, the background deeplink can permanently delete without showing a prompt. Foreground permanent deletion still asks for confirmation every time. Canceling a foreground permanent deletion disables background permanent deletion until the next foreground approval. Use the Toggle Deletion Behavior command to switch between Trash and Permanently Delete.

## What differs from the reference, and why

- **The trash is `gio trash`, not the API's `trash()`.** Vicinae's `trash()` is
  `rm -r`; deployed as upstream, every delete would remove the file permanently while
  reporting that it went to the trash.
- **Four shortcuts** were reshaped from `{macOS: …, Windows: …}` to `{modifiers, key}`,
  which is what Vicinae reads. In the reference form those actions bound nothing.
- **`Toggle Quick Look`** is gone: Quick Look is macOS-only, and there is no thumbnailer
  in `@vicinae/api` to replace it. Text preview in the detail pane is unaffected.
- **`keywords`** were added to every row. The reference passes none, so a row titled
  `Отчёт (2).pdf` cannot be found by `otchet` and nothing answers to `pdf`.
- **The six AI tools** in `src/tools/` are not deployed: the Vicinae manifest has no
  `tools` key, so nothing would read them.

Caveat on `Add Time` sorting: `/home` is btrfs mounted `relatime`, where reading a file
updates its access time. That setting is upstream's and is kept, but the order it
produces can shift after a preview or a `stat`.
