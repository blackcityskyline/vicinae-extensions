# Audit: `custom-store` ← the built-in extension store

A store for extensions that are not on `api.vicinae.com`: the built-in store's UI,
pointed at a repository the user names in a preference. Install from a local
directory or a remote index, remove an extension from
`~/.local/share/vicinae/extensions`.

Everything below was measured on 2026-11-13 against Vicinae 0.30.0's sources at
`/tmp/opencode/vicinae-src` and the live API, not recalled.

## What the built-in store does

| Piece | Measured |
| --- | --- |
| List | `GET https://api.vicinae.com/v1/store/list?page=1&limit=50` → `{extensions: [...], pagination: {page, limit, total, totalPages, hasNext, hasPrev}}` |
| Search | `GET https://api.vicinae.com/v1/store/search?q=<urlencoded>` → same shape |
| Entry | `id, name, title, description, author{handle,name,avatarUrl,profileUrl}, downloadCount, apiVersion, checksum, trending, icons{light,dark}, categories[], platforms[], commands[], sourceUrl, readmeUrl, downloadUrl, createdAt, updatedAt` |
| Platform filter | entries whose `platforms` do not contain `linux` are dropped client-side (`postProcess`) |
| Extension id | rewritten to `store.vicinae.<name>` — the author is not part of it |
| Download | `GET https://api.vicinae.com/v1/store/<author>/<name>/download` → `200 application/zip`. Measured 1,023,406 bytes for `dagimg-dot/player-pilot` |
| Archive layout | one root folder: `player-pilot/{package.json, player-pilot.js, assets/...}` |
| Install | unzip to `extensions/.staging-<id>`, **strip the first path component**, require `package.json` at the stripped root, `rm -rf` the old directory, rename staging into place |
| Uninstall | `rm -rf extensions/<id>`, `rm -rf support/<id>`, clear the extension's storage namespace |
| Reload | `QFileSystemWatcher` on `extensions/`, 100 ms debounce, rescan — no restart |

Source: `services/extension-store/vicinae-store.cpp`, `services/extension-registry/extension-registry.cpp`,
`actions/extension-actions.cpp`, `builtins/vicinae/vicinae-store-model.cpp`.

**There is no `vicinae://install`.** The deeplink handler in `ipc/ipc-command-handler.cpp`
accepts `vicinae://extensions/<author>/<name>`, which opens the store's detail view for
that extension; the install action is a button in that view and fetches `downloadUrl`
itself. A custom store has to do the download and the unpacking on its own.

## What the installed directory looks like

`~/.local/share/vicinae/extensions` holds 68 directories on this machine. The directory
name **is** the extension id; the folder is a built bundle, not a source tree:

```
extensions/
  wallhaven/                    <- `vici build` output, id = "wallhaven"
  store.vicinae.player-pilot/   <- store install, id = "store.vicinae.player-pilot"
  store.vicinae.coffee/
```

Every bundle has `package.json` plus compiled `.js` entrypoints per command and an
`assets/` folder. There is no `src/`, no `node_modules`, no lockfile. `support/<id>/`
holds filesystem-API data, and extension storage lives in `vicinae.db`.

`Omnicast::dataSearchPaths("extensions")` returns `$XDG_DATA_HOME/vicinae/extensions`
first, then the system data dirs (`/usr/share/vicinae/extensions`, …). Installs go into
the user directory; the system ones are read-only by convention.

## What a custom repository is

Both formats below are invented here — there is no upstream spec to follow — so they are
kept to what the store UI needs and nothing more.

### Local repository: a directory

Immediate children are packages, in one of two shapes:

```
repo/
  player-pilot/          <- a built bundle: package.json, *.js, assets/
  other-extension.zip    <- the store's own archive shape: one root folder + package.json
```

Reading the list is a directory scan plus one `package.json` per child — no index file to
keep in sync with the packages. A child directory without `package.json` is skipped with a
warning, not shown.

### Remote repository: `index.json` plus archives

The preference's URL may point at the index itself (`…/index.json`) or at a directory
serving one (`…/` → `…/index.json`).

```json
{
  "extensions": [
    {
      "name": "player-pilot",
      "title": "Player Pilot",
      "description": "Control every running media player.",
      "author": "black",
      "icon": "player-pilot.png",
      "archive": "player-pilot.zip"
    }
  ]
}
```

`archive` and `icon` are resolved against the index URL, so both relative and absolute
URLs work. An entry without `archive` is skipped: there is nothing to install.

### The id an install takes

The bundle's directory name in `extensions/` is the manifest's `name`, because that is
what `vici build` writes for every extension in this repository and two packages can only
collide on it if they advertise the same name. Reinstalling an id replaces its directory
exactly like the built-in store does. Installing over an extension that is already
installed therefore updates it; there is no version comparison, because the Vicinae
manifest has no version field.

## What is cut

| Built-in store | Here | Why |
| --- | --- | --- |
| pagination, `hasNext` | none: one index or one directory | a personal repository is tens of entries, not thousands |
| download counts, trending, `apiVersion`, checksums, `createdAt` | none | the repository does not publish them |
| author avatars and profile links | the manifest's `author` string | no profile exists behind a local package |
| categories, keywords, command previews, README, screenshots | one row per extension: icon, title, description | the list is the store; details live in `README.md` |
| platform filtering | the manifest's `platforms` is not consulted | the repository is this machine's, written by hand |
| `store.vicinae.<name>` ids | the manifest `name` | these are not store packages, and the id must match what `vici build` installs |
| uninstall clears the storage namespace in `vicinae.db` | directory and `support/<id>` only | the db is Vicinae's private state; writing it from an extension would couple to its schema |
| install from the Raycast store format | not supported | it is a different registry with a different archive |

## Mechanics to implement

| Step | Call |
| --- | --- |
| list local | `readdir(repo)`, `readFile(child/package.json)` |
| list remote | `fetch(indexUrl)`, `JSON.parse` |
| install local bundle | `fs.cp(dir, extensions/<name>, {recursive: true})` |
| install archive | `unzip -q -o <archive> -d extensions/.staging-<name>`, then use the single subdirectory that holds `package.json`, rename into place |
| download archive | `fetch(new URL(archive, indexUrl))` → buffer → temp file |
| remove | `rm -rf extensions/<id>`, `rm -rf support/<id>` |
| reload | nothing: the registry watches the directory |

`unzip` is required for archives (measured: `/usr/bin/unzip`, Info-ZIP 6.00) and is an
Arch package (`unzip`), so it is a stated requirement rather than a bundled dependency.
Local bundles need nothing but Node's own `fs`.

A staging directory is used for archives so a half-extracted download never becomes a
visible extension: the registry rescans 100 ms after any change in `extensions/`, and a
directory without `package.json` fails to load with an error in the log.
