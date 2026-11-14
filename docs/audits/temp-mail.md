# temp-mail, measured

Measured: the upstream plugin this extension was rewritten from, and the mail.tm
service it talks to. Read from source or answered by the live API on 2026-11-04;
nothing recalled from docs.

## What upstream is

[`AhmadRun/temp-mail`](https://github.com/AhmadRun/temp-mail) v0.1.3, by Ahmad
Elyan, MIT — an **Omarchy/Quickshell bar widget**, not a launcher extension. No
Raycast or Vicinae code to port; what transfers is the behaviour.

| File | Lines | Role |
| --- | --- | --- |
| `TempMailWidget.qml` | 676 | the bar button, the countdown, the panel and inbox |
| `bin/temp-mail` | 175 | bash; the only code that talks to mail.tm |
| `TempMail.js` | 93 | pure helpers, loaded by both the widget and the tests |
| `components/MessageRow.qml` | 87 | one inbox row |
| `tests/test_temp_mail.js` | 49 | node tests over `TempMail.js` |
| `manifest.json` | 71 | the widget's five settings and their defaults |

Every network call is a one-shot `Process` running the bash helper, which prints
one line of JSON; the widget holds no token in a variable it could leak, and the
helper owns the state file.

### State and files

```
state: ${XDG_STATE_HOME:-~/.local/state}/omarchy/settings/temp-mail.json  (0600)
html:  ${XDG_RUNTIME_DIR:-/tmp}/temp-mail/<message-id>.html
lock:  flock on .temp-mail.lock, `-w 20`, around every call
```

Keys `address`, `accountId`, `token`, `password`, `createdAt`, `expiresAt`.
Deleting the address (`delete_account`) removes the state file **and** the whole
html directory.

### Secrets never reach argv

Process arguments are world-readable through `/proc/<pid>/cmdline`. The bearer
token goes to `curl` as a config on stdin (`-K -`); credentials reach `jq`
through its environment (`TM_ADDRESS=… jq '{address: env.TM_ADDRESS}'`),
owner-only. The port keeps the rule: no credential is ever an argument, and none
is written to a log, a toast or a notification.

### Lifetime rules

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

The list rotates; the old README note said `uberip.com`.

| Probe | Answer |
| --- | --- |
| `GET /domains` | 200, **one** member: `fldubai.com`, `isActive: true`, `isPrivate: false`, `createdAt: 2026-10-30T00:00:00+00:00` |
| rate limit headers | `ratelimit-policy: 30; w=60` on `/token`, `/domains` and `/messages` alike — nothing in the headers gives `/token` a separate budget. An earlier README note claimed one (sixty back-to-back requests all answered 200); not re-measured, not relied on: the port caches the token to save a request, not because a separate budget was proven |
| `POST /messages` | **405** `Method Not Allowed` — no sending through this API |
| `POST /token` for an unregistered address, and for a registered one with the wrong password | **401** both times, on every try today — except one earlier probe of the same request, which answered **404**. The service is not consistent, so the port treats 401 and 403 as "this address no longer works" and lets a stray 404 read as a server answer |
| `GET /contexts/Message` | 200; the only key is `@context`, and `verifications` appears as the bare JSON-LD term `"Message/verifications"` — **no type is published** |
| `dig MX fldubai.com` | `10 in.mail.tm` |

### Account lifecycle, end to end

One run of the sequence the extension uses, generated address and password,
neither printed:

| Call | Answer |
| --- | --- |
| `POST /accounts` | **201**, body carries `id` |
| `POST /token` | 200, `token` |
| `GET /me` | 200 |
| `GET /messages` | 200, a **plain JSON array**, empty — not a hydra envelope |
| `DELETE /accounts/<id>` | **204** |
| `POST /token` for the deleted account | **401** |

Hence the token is dropped locally on reset, and `401` means "this address no
longer works", not a wrong password: after the account is gone the password is
simply wrong.

`PATCH /me` with `application/merge-patch+json` answers **405** — the merge-patch
mark-seen call belongs on `/messages/{id}`, which the port does. That path is
unexercised: it needs a message, and no message can be created (below).

`verifications` having no published type is why `src/utils/codes.ts` accepts a
string or an object with `code`/`value`. Measured on a live message on
2026-11-12, that was wrong: the property is not a list of codes. mail.tm puts the
mail's authentication result there:

```json
{"tls": {"name": "ECDHE-RSA-AES128-GCM-SHA256", "standardName": "TLS_…", "version": "TLSv1.2"},
 "spf": false, "dkim": false}
```

`for (const found of verifications ?? [])` threw `TypeError: … is not iterable`
inside the message view, so **every** message crashed the view it opened in. The
field is read only when it really is an array, checked in `test/codes.test.ts`;
codes come from the prose.

### Mail cannot arrive here

`in.mail.tm` is unreachable on both 25 and 443 here — `[Errno 101] Network is
unreachable`, not a timeout. No SMTP client or relay is installed, and outbound
25 is closed to every MX tried (`gmail-smtp-in.l.google.com`, `mx1.improvmx.com`,
`alt1.aspmx.l.google.com`: all refused). Reading, deleting, token renewal and
account creation are exercised against the live API; sending is unproven because
it cannot be done from here.

### Mail does arrive, measured 2026-11-12

`POST https://formsubmit.co/ajax/<address>` is a form endpoint with no account
and no key: the first submission to an unseen address mails it an activation
link. That was all this needed.

- A fresh `fldubai.com` address registered through the extension got the
  activation mail **5 seconds** after the POST.
- The inbox showed it with no input: launcher open, nothing pressed, poll 10 s;
  the row appeared with `2 new` on the address and `New` on the row.
- Subject, sender (`submissions@formsubmit.co`), relative time (`just now`) and
  `Inbox (n)` count all matched `GET /messages`.
- A second submission after activating the endpoint (`GET` on the mail's
  `/confirm/<token>` link with a browser UA; without one it is `403`) carried an
  arbitrary subject and body, producing a `Code 482910` row: subject
  `Your code is 482910` and the same number in the prose.
- `GET /messages/{id}` after opening the mail shows `seen: true`; the port's
  mark-seen path works.

### The rest of the view, measured the same day

- **`Copy Code` is concealed**: the code lands on the clipboard, and
  `clipboard.db` has no row containing it, while the address copied with
  `Copy Address` does appear there.
- **`Paste Code` types it**: with a `cat > file` terminal focused, the launcher
  opened over it, `Paste Code` closed the launcher and typed `482910` into the
  terminal. The file was empty until `Ctrl+D` because `cat` buffers.
- **A token is not a code**: the activation mail's `…/confirm/e70020df…` was
  offered as `Code 70020`, because `confirm` matched and the digits followed it.
  Digits must now stand alone.
- **`Open HTML Version` opened the file manager, not the browser.** The port
  passed a `file://` URL to `open()`; here `x-scheme-handler/file` belongs to
  `dev.duxlabs.files.desktop`, so the page never opened. Passing the path instead
  resolves `text/html` (`zen.desktop`) and the page rendered. `ShowInFinder` was
  left; the duplicate "Open the Saved Page" action was deleted.
- **The saved page is inert**: the document begins with
  `<meta http-equiv="Content-Security-Policy" content="script-src 'none'; object-src 'none'; form-action 'none'">`,
  and the mail's own scripts are behind it. Remote images are not blocked — the
  page's `i.ibb.co` images load.
- **The ceiling toast lied**: at 60:00 another `Extend by 10 Minutes` said
  "Extended by 10 minutes" and the countdown did not move. It now says "That is
  the 60-minute ceiling". The clamp was always right (`59:58` after repeated
  extends).
- **`Reset TempMail` deletes on mail.tm**: the stored keys go, the saved HTML
  directory goes, and `GET /me` with the token that was `200` a minute earlier
  answers **401**.
- **Replacing the address deletes the old one**: after `Replace With a
  10-Minute Address` the old token answers 401 and the new address is in
  `LocalStorage`.
- **The confirm dialog dismisses on Return.** `Return` on the alert threw the
  address away without creating one in the first observation; the primary button
  is reached with `Shift+Tab` first. This is the launcher's alert.
- **`Check For Mail Every` = Never** (set in `providers.@black/tempmail` in
  `~/.config/vicinae/settings.json`, needs a server restart): mail sent while the
  inbox was open did **not** appear after 25 s; the Refresh row then loaded it,
  and its subtitle read "mail.tm, checked only when you ask".
- **The subtitle is real**: after a background run, searching the command shows
  `Check For Mail  58:54 left - 7 unread`.
- **No notification was seen, and none can be.** Nothing owns
  `org.freedesktop.Notifications` here (`busctl --user list` has no notification
  service). The interval run happens every minute in the log, and the body is
  built from the sender and the count only, never the subject — read from the
  code, not watched.

## Vicinae's own interval, measured

Upstream is always-on, so the port needs a self-scheduled run. Vicinae gives
exactly one mechanism:

```
[V] [ExtensionIntervalScheduler] Executing "tempmail:check-mail"
[E] Loaded extension tempmail:check-mail
[E] Started extension tempmail:check-mail
[E] Unloaded extension tempmail:check-mail (ran for 0.001s)
[E] Worker tempmail:check-mail exited with code 1
```

- `interval` (`@vicinae/api/dist/schemas/manifest.js`) takes `^(\d+)(s|m|h|d)$`
  and launches a **no-view or menu-bar** command in the background, minimum 10
  seconds; a `view` command cannot be scheduled, so the background half is its
  own command. `"60s"` is six times the floor.
- `"60s"` fired every minute, with no window, in every minute observed.
- The `[E]` prefix and `exited with code 1` are Vicinae's teardown, not a
  failure: `store.vicinae.coffee:status`, the store widget, logs the identical
  exit-1 line, and `docs/definition-of-done.md` names the cause. The 1–4 ms run
  is the no-address early return — no account had been created, and
  `support/tempmail/.vicinae/std{out,err}.txt` are both 0 bytes. With no stored
  account `check-mail` makes no request, so install adds no periodic load on
  mail.tm.
- No `tempmail` log line carries an error of its own.
- Scheduler state: `~/.local/state/vicinae/extension-intervals.json` held
  `{"tempmail:check-mail": 1793740852}` — `00:20:52` local, the same minute as
  the newest run; every run lands on the `:52` second.

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
