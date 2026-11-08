# Audit: `wifi-commander` → upstream fork

Source: `vicinaehq/extensions`, `extensions/wifi-commander`, author `dagimg-dot`,
contributor `Gareck-OG`. Last commit touching the directory: `5d1d31a`
(2026-07-02, a repository-wide lock regeneration).

The installed copy was `store.vicinae.wifi-commander`, dated 2026-09-30: five
bundled, minified `.js` files and an `assets/` icon. Its `package.json` is
byte-identical to upstream's, and upstream keeps the sources as TypeScript, so the
fork deploys upstream's `src/` rather than the bundles. The store copy was removed
from `~/.local/share/vicinae/extensions`; the fork installs as `wifi-commander`.

## What ships

`src/` as upstream wrote it — 22 files, 2781 lines — with the packaging made
standalone and four compile fixes.

| File | Change |
| --- | --- |
| `package.json` | `@vicinae/api` `^0.22.2` → `^0.29.0`, template dev dependencies, `lint`/`check` scripts, `tsconfig.json` no longer extends the monorepo root |
| `tsconfig.json` | standalone: `strict`, `noUncheckedIndexedAccess`, `types: ["node"]`, `src/**/*` plus the generated `vicinae-env.d.ts` |
| `src/nmcli/toggle-wifi-off.ts` | imported `executeIwctlCommand` and `ExecResult`, neither exported by `execute-nmcli`; the import was dead |
| `src/iwctl/manage-saved-networks.tsx` | `availableNetworks` was written but never read; renamed `_availableNetworks` |
| `src/utils/wifi-helpers-iwctl.ts` | `lines[4]` and `lines[0]` indexed unchecked; `parseAutoconnectFromResult` read `lines[6]` **before** its length test, so a short `iwctl` reply threw instead of returning `Unkown` |

## Fork addition: hotspot

`create-hotspot` (view) is not upstream's. It asks for a network name, a
password and a band, then runs `nmcli device wifi hotspot`. The syntax was read
from `nmcli device wifi help` on nmcli 1.58.1:

```
hotspot [ifname <ifname>] [con-name <name>] [ssid <SSID>]
        [band a|bg|6GHz] [channel <channel>] [password <password>]
```

The Wi-Fi device is the first `wifi` row of `nmcli -t -f DEVICE,TYPE device
status`. nmcli is executed with an argv array rather than the extension's
shell-string wrapper, so a password containing `$(…)` or a quote is data.
`src/utils/hotspot.ts` holds the argument builder and the device picker,
`test/hotspot.test.ts` covers both, and the `iwctl` branch of the dispatcher
renders a `List.EmptyView` saying it has no hotspot command.

Upstream's view dispatchers are synchronous; only its `no-view` ones are `async`.
The hotspot dispatcher was written `async` at first, and the command window sat on
the loading placeholder without ever rendering the form — a view command must
return React elements, and an `async` default returns a promise
(`docs/authoring-extensions.md`). It is synchronous now, and the `iwctl` notice
became an element for the same reason: a toast cannot be awaited from a render.

## Commands

Upstream's five: `toggle-wifi-on`, `toggle-wifi-off`, `restart-wifi`, `scan-wifi`,
`manage-saved-networks`. Each entry point reads the `network-cli-tool` preference
and dispatches to `src/nmcli/` or `src/iwctl/`.

## Known upstream defects left alone

- Both CLI wrappers expose `isNmcliAvailable` / `isIwcltAvailable`; nothing calls
  them, so a missing binary surfaces as a toast from the failing command instead
  of a prerequisite message.
- `iwctl` reports autoconnect as `Unkown` (sic) when it cannot read it, and the
  manage view compares against that literal.
- Every dispatcher ends its `switch` case with `break` after a `return`.

## Verified

- `npm run lint`, `npm run check` (`tsc --noEmit` with `noUnusedLocals`),
  `npm test` (six checks over `hotspotArgs` and `firstWifiDevice`) and
  `npm run build`, which listed all six entry points.
- `vicinae logs` shows `Loaded extension wifi-commander:scan-wifi` and
  `Started extension`, then an orderly unload, with no error line; the same for
  `create-hotspot`.

## Not verified

- The scan list, connect form, saved-network list and the two no-view toggles
  were not exercised; the machine's Wi-Fi state was not changed.
- No hotspot was created: turning the connected adapter into an access point
  would drop this machine's own link. Only the argument builder and the device
  picker are covered.
- The `iwctl` branch was not exercised at all; the installed `nmcli` branch is
  the one Vicinae can reach here.
