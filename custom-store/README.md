# Custom Store

Browse your own sources of extension bundles as one list: install a package,
uninstall an extension, and skip the built-in store. Sources are summed, not
switched between — every configured source is read at the same time and the
rows are merged.

## Sources

| Kind | Example | Read as |
| --- | --- | --- |
| Local folder | `~/dev/extensions` | every child directory that is a built bundle |
| Index URL | `https://example.com/store` | `index.json` at that URL, or below it |
| Git repository | `https://github.com/you/store` | shallow clone, then as a local folder |

The first source is the `Repository` preference and cannot be removed from the
store; changing it is an edit to the extension's settings. The others are added
from the store: `Manage Sources` (`ctrl+shift+s`) → `Add Source`. They are kept
in Vicinae's local storage for this extension, which is where the `Preference`
tag on that page comes from.

A Git source is cloned once into `~/.cache/custom-store/<hash>`
(`XDG_CACHE_HOME` is honoured) and read from the cache afterwards, so opening
the store makes no network call. `Refresh` (`ctrl+r`) pulls. GitHub, GitLab,
Codeberg and Bitbucket URLs count as Git, as does anything ending in `.git` or
reached over `ssh://`, `git@` or `file://`; every other `http(s)` URL is an
index. A private repository fails instead of waiting for credentials — the
launcher has no terminal to type them in.

When two sources list the same `name`, the earlier one provides the row: the
preference first, then the added sources in the order they were added. A source
that cannot be read does not empty the store; its reason appears in a section of
its own while the other sources keep their rows. Removing a source leaves its
clone in the cache; delete that directory to reclaim the space.

## Repository format

A local folder and a Git repository both hold built bundles: a `package.json`,
the compiled `<command>.js` entrypoints and `assets/`, exactly what `vici build`
leaves in `~/.local/share/vicinae/extensions`. A child directory whose manifest
is missing, or whose commands have no compiled entrypoint next to it, is not a
bundle and is skipped — an extension's source tree has the manifest and nothing
to run.

A remote index is `index.json`; relative `archive` and `icon` paths resolve
against it:

```json
{
  "extensions": [
    {
      "name": "player-pilot",
      "title": "Player Pilot",
      "description": "Control every running media player.",
      "archive": "player-pilot.zip",
      "icon": "icons/player-pilot.png",
      "readme": "docs/player-pilot.md",
      "downloads": 1234
    }
  ]
}
```

`name`, `title`, `description` and `archive` are required; the rest is rendered
when present. `archive`, `icon`, `avatar`, `readme` and `source` accept relative
or absolute URLs. An entry without an archive is not listed.

## Actions

| Action | Key |
| --- | --- |
| Show Details | `enter` |
| Install | `ctrl+i` |
| Uninstall | `ctrl+shift+x` |
| Refresh | `ctrl+r` |
| Manage Sources | `ctrl+shift+s` |
| Add Source, on the sources page | `ctrl+n` |
| Add Source, in the form | `ctrl+s` |
| Remove Source | `ctrl+x` |

Install replaces a directory of the same name (the manifest has no version to
compare), extracts through `.staging-<id>` and renames into place, so a
half-extracted download never becomes visible. A bundle cloned from a Git
repository is copied without its `.git` directory. Uninstall deletes the
directory and its `support/` data after a confirmation. The registry rescans
within 100 ms, so a new extension appears without a restart.

## Preferences

| Name | Notes |
| --- | --- |
| Repository | required; the first source; a folder of bundles or an `http(s)` URL serving `index.json`; `~` expands |

`unzip` (Info-ZIP) is needed for archive installs, `git` for Git sources.

The repository format is this extension's own, not an upstream spec.
