# temp-mail, measured

Two things were measured here: the upstream plugin this extension was rewritten
from, and the service it talks to. Everything below was read from the source or
answered by the live API on 2026-11-04; nothing is recalled from its docs.

## What upstream is

[`AhmadRun/temp-mail`](https://github.com/AhmadRun/temp-mail) v0.1.3, by Ahmad
Elyan, MIT — an **Omarchy/Quickshell bar widget**, not a launcher extension.
There is no Raycast or Vicinae code in it to port; what transfers is the
behaviour.

| File | Lines | Role |
| --- | --- | --- |
| `TempMailWidget.qml` | 676 | the bar button, the countdown, the panel and inbox |
| `bin/temp-mail` | 175 | bash; the only code that talks to mail.tm |
| `TempMail.js` | 93 | pure helpers, loaded by both the widget and the tests |
| `components/MessageRow.qml` | 87 | one inbox row |
| `tests/test_temp_mail.js` | 49 | node tests over `TempMail.js` |
| `manifest.json` | 71 | the widget's five settings and their defaults |

The split matters: every network call is a one-shot `Process` running the bash
helper, which prints one line of JSON. The widget never holds a token in a
variable it could leak, and the helper owns the state file.

### Its state and its files

```
state: ${XDG_STATE_HOME:-~/.local/state}/omarchy/settings/temp-mail.json  (0600)
html:  ${XDG_RUNTIME_DIR:-/tmp}/temp-mail/<message-id>.html
lock:  flock on .temp-mail.lock, `-w 20`, around every call
```

`address`, `accountId`, `token`, `password`, `createdAt`, `expiresAt`. Deleting
the address (`delete_account`) removes the state file **and** the whole html
directory.

### Its secrets never reach argv

`bin/temp-mail` states the reason in its own comments: process arguments are
world-readable through `/proc/<pid>/cmdline`. The bearer token is handed to
`curl` as a config on stdin (`-K -`), and credentials reach `jq` through its
environment (`TM_ADDRESS=… jq '{address: env.TM_ADDRESS}'`), which is owner-only.
The same rule holds here: no credential is ever an argument, and none is
written to a log, a toast or a notification.

### Its lifetime rules

| | |
| --- | --- |
| lifetimes offered | 10 or 30 minutes, nothing else (`{value:10}`, `{value:30}` in the panel; `defaultDuration` enum `"10"`/`"30"`) |
| `new <minutes>` | 1–60, default 10; **deletes the existing account first** |
| `extend <minutes>` | 1–30, default 10; `.expiresAt = min(expiresAt + m, now + 3600)` — an address never lives more than 60 minutes from now |
| creation retries | three random addresses until a 201 |
| username | one letter plus nine `[a-z0-9]` |
| password | 24 `[A-Za-z0-9]` |
| polling | `pollSeconds` clamped to 3–60, default 5; a separate 1 s timer drives the countdown |
| expiry | `msLeft <= 0` → notify "Temp address expired", delete the address |
| warning | `msLeft <= 60000 && !warned` → notify once, "press + to extend" |
| new mail | `inboxLoaded` starts false, so the first inbox of a session never notifies; `knownIds` is an in-memory map, reset when the address changes or the shell reloads |
| notification body | count and `senderLabel(fromName, from)` only — never the subject, because "subjects often carry verification codes" (its own comment) |
| reading | `read <id>` fetches the message, prints it, then PATCHes `{"seen":true}` with `application/merge-patch+json` |
| codes | `verifications` first, then a 4–8 digit number within 40 characters of `code\|pin\|otp\|verif\w*\|confirm\w*\|password\|كود\|رمز`, then a bare number in the subject; max 3, max 12 chars, links skipped |
| html | `open <id>` writes the CSP-guarded document and hands the `file://` path to `omarchy-launch-browser` |
| message ids | `check_id` refuses anything but `^[a-f0-9]{24}$` before fetching or writing |

## mail.tm, measured 2026-11-04

The old note in this repo's README said `uberip.com`. The list rotates.

| Probe | Answer |
| --- | --- |
| `GET /domains` | 200, **one** member: `fldubai.com`, `isActive: true`, `isPrivate: false`, `createdAt: 2026-10-30T00:00:00+00:00` |
| rate limit headers | `ratelimit-policy: 30; w=60` — on `/token`, `/domains` and `/messages` alike, so nothing in the headers says a login costs a different budget than a poll. An earlier note in this repo's README claimed `/token` had its own larger budget (sixty back-to-back requests all answered 200); that was not re-measured today and is not relied on: the port caches the token because it saves a request either way, not because a separate budget was proven |
| `POST /messages` | **405** `Method Not Allowed` — there is no sending through this API |
| `POST /token` for an address that was never registered, and for a registered one with the wrong password | **401** both times, on every try today — except one earlier probe of the same request, which answered **404**. The service is not consistent about it, so the port treats 401 and 403 as "this address no longer works" and lets a stray 404 read as a server answer, rather than writing a special case for one observed fluke |
| `GET /contexts/Message` | 200; the only key is `@context`, and `verifications` appears in it as the bare JSON-LD term `"Message/verifications"` — **no type is published** |
| `dig MX fldubai.com` | `10 in.mail.tm` |

### The account lifecycle, end to end

One run of exactly the sequence the extension uses, with a generated address
and a generated password, neither of which was printed:

| Call | Answer |
| --- | --- |
| `POST /accounts` | **201**, body carries `id` |
| `POST /token` | 200, `token` |
| `GET /me` | 200 |
| `GET /messages` | 200, a **plain JSON array**, empty — not a hydra envelope |
| `DELETE /accounts/<id>` | **204** |
| `POST /token` for the deleted account | **401** |

The last two are the reason the token is dropped locally on reset and the
reason `401` reads as "this address no longer works" rather than as a password
problem: after the account is gone, the password is simply wrong.

`PATCH /me` with `application/merge-patch+json` answers **405** — the merge-patch
mark-seen call belongs on `/messages/{id}`, which the port does. That path could
not be exercised: it needs a message, and no message can be created (see below).

`verifications` having no published type is why `src/utils/codes.ts` accepts a
string or an object with `code`/`value` and takes entries as they come, rather
than declaring a shape.

### Mail cannot arrive here

`in.mail.tm` is unreachable on both 25 and 443 from this machine — `[Errno 101]
Network is unreachable`, not a timeout, so it is the network and not the host.
There is also no SMTP client or relay installed. Receiving is the one thing this
extension exists to do, and it is unproven in both directions: the API cannot
send (405) and this machine cannot send (no route). Reading, deleting, token
renewal and account creation are all exercised against the live API.

## Vicinae's own interval, measured

Upstream is always-on, so the port needs a run that happens by itself. Vicinae
gives exactly one mechanism, and it was checked rather than assumed:

```
[V] [ExtensionIntervalScheduler] Executing "tempmail:check-mail"
[E] Loaded extension tempmail:check-mail
[E] Started extension tempmail:check-mail
[E] Unloaded extension tempmail:check-mail (ran for 0.001s)
[E] Worker tempmail:check-mail exited with code 1
```

- The field's own contract, read from the schema the linter validates against
  (`@vicinae/api/dist/schemas/manifest.js`): `interval` takes `^(\d+)(s|m|h|d)$`
  and "specifies that a **no-view or menu-bar** command should be launched in
  the background every X seconds… The minimum value is 10 seconds". A `view`
  command therefore cannot be scheduled, which is why the background half is its
  own command. `"60s"` is six times the floor.
- `"60s"` fired every minute, with no window, in every minute observed.
- The `[E]` prefix and `exited with code 1` are **not** this extension failing.
  `store.vicinae.coffee:status`, Vicinae's own store widget, logs the identical
  exit-1 line on every one of its interval runs, and
  `docs/definition-of-done.md` documents the teardown as the cause. The run
  finishing in 1–4 ms is the no-address early return, and that was checked
  rather than assumed: no account had been created in this session, and
  `support/tempmail/.vicinae/std{out,err}.txt` are both 0 bytes, so nothing was
  printed and nothing threw. With no stored account `check-mail` makes no
  request at all, so installing the extension puts no periodic load on mail.tm.
- No `tempmail` line in the log carries an error of its own.
- The scheduler keeps its own state, and it names this command:
  `~/.local/state/vicinae/extension-intervals.json` held
  `{"tempmail:check-mail": 1793740852}` — `00:20:52` local, the same minute the
  log shows for the newest run, and every run in the log lands on the `:52`
  second.

## What the port did not carry over

| Cut | Why |
| --- | --- |
| `escapeHtml`/`linkify`/`unescapeHtml` | they exist to feed Quickshell's `StyledText`. The markdown detail pane is not a markup sink, so there is nothing to escape into. |
| `parseJson` | bash's answer arrives as text; the port calls `fetch` and gets an object. |
| the `flock` | one process per run, one LocalStorage per extension, and Vicinae owns the scheduler. |
| the state file and `chmod 600` | `LocalStorage` is the platform's, with its own location and permissions. |
| `iconOnly` | a bar button setting; the launcher row is not a bar. |
| `XDG_RUNTIME_DIR` html directory | `environment.supportPath` instead, which Vicinae removes with the extension. Deleted with the address exactly as upstream deletes its directory. |
| `omarchy-launch-browser` | `open()` from `@vicinae/api`. |
| three creation retries | upstream is guessing a random name, so a collision is a coin flip to retry. Here the 422 arrives from a name the person typed, and the form shows it. |
| `pollSeconds` minimum of 3 | the API budget is 30 a minute for everything; 3 s would spend twenty of them on the inbox alone. |
| 429 "sleep 1 and retry once" | the port surfaces the limit instead: a background run that retried would be invisible, and an inbox that shows "wait a minute" explains the empty list. |
| `knownIds` in memory | the same ids, persisted (`reportedMessageIds`, capped at 100), because a run every minute is a new process every minute. |
| the code gap `[^\d\n]{0,40}` | upstream will not look past a line break, but mail wraps at about seventy-eight characters, so `Your code is:\n123456` — the shape code mails actually arrive in — finds nothing. The port's gap allows the break (`test/codes.test.ts`: *the code may be on the line after the word*). |
