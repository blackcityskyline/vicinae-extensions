# git-repos

Port of [raycast/extensions `git-repos`](https://github.com/raycast/extensions/tree/main/extensions/git-repos)
at `c33bf4cb4b9ad70c2b93432ee713ffb7486ed331`. Your local repositories, opened in
whichever application you name.

| Command | Does |
| --- | --- |
| List Repos | every repository under the scan path, favourites first, then by how often and how recently you opened them; filter by repo type, open with a configured app, open a remote, favourite, copy the path, quicklink |
| Clone Repo | `git clone` a URL into one of the scanned directories, then back to the list |
| Remove Repo | remove a repository after checking it has nothing uncommitted or unpushed, with a force path that skips the checks |

## Preferences

`Path to Scan for Git Repos` — one or more directories separated by `:`, `~`
expanded, each one must exist or it is listed as missing. `Max Scan Depth` 2–6: a
repository is found when the repository directory is at most that deep below a
scan root. `Include Submodules` adds submodules as their own rows. `Search by`
matches the name or the tildified path.

`Open with 1` … `Open with 5` take a desktop-entry application id, not a name
path: `org.gnome.Nautilus`, `kitty`, `thunar`, `code`. `vicinae app launch
org.gnome.Nautilus ~/dev/x` is the same call from the shell. An empty id renders
no action, so three ids give three actions.

| Action | Key |
| --- | --- |
| Open with 1 … 5 | `enter`, `ctrl+enter`, `alt+enter`, `ctrl+shift+enter`, `shift+enter` |
| Open with… (any application) | `ctrl+o` |
| Open in All Applications | `ctrl+shift+a` |
| Add / Remove Favourite | `ctrl+shift+f` |
| Create Quicklink | `ctrl+shift+l` |
| Open `origin` / `upstream` remote | `ctrl+shift+o` / `ctrl+shift+u` |
| Copy Path | `ctrl+shift+c` |
| Remove / Force Remove (Remove Repo) | `ctrl+shift+x` / `ctrl+alt+x` |

A GitHub remote becomes a submenu (code, issues, pull requests); GitLab,
Bitbucket and self-hosted remotes get one `Open` action. A remote whose URL does
not parse to a host and a path — a plain path, a `file://` URL — is not shown at
all.

## Removal

Both remove actions first run `git status --porcelain` and refuse on any output,
then require that `git log --branches --not --remotes` is empty when the
repository has remotes. The confirmation dialog says the repository goes to the
Trash; it is removed with `gio trash`, because Vicinae's `trash()` is `rm -r`.
`gio` refuses to trash anything on another mount than home — on `/tmp` it answers
`Trashing on system internal mounts is not supported` and the toast shows that.

## Measured

Scan of `~/dev` at depth 3: 66 repositories in 276 ms, the same 66 that
`find ~/dev -maxdepth 3 -name .git | wc -l` lists. A worktree reached both
directly and through a symlink appears once, as `Worktree`: rows are deduplicated
by `fs.realpathSync`, not by the path the walk found. A submodule (`git` file in
its directory) is a `Worktree` row when submodules are not included, because that
is what the marker is.

## Cut from the port

- `appPicker`: the Vicinae manifest has no such preference type. The app ids are
  text fields; `open(path, appId)` is the Vicinae signature.
- `default-browser` and `get-installed-browsers`: macOS-only, and they only
  decided whether an "open with" action should open the remote URL instead of the
  folder. Remotes are opened explicitly, by `Action.OpenInBrowser`.
- `defaultBrowserId` on every row, which came from that detection.

`git-url-parse` and `parse-git-config` stay: nested GitLab groups, ports and
worktree `.git` files need them.

## Tests

`npm test` runs `test/git-repos.test.ts` under a `@vicinae/api` stub. It covers
the pure logic only — path splitting and `~` expansion, tildify, the depth
limit, a `.git` directory versus a worktree's `.git` file, symlink
deduplication, submodule inclusion, remote URL to `https` host and path, and the
usage decay. The UI is checked by launching the three commands.
