# Audit: Bluetooth battery level, where BlueZ actually puts it

Measured 2026-11-05 on this machine (`bluetoothctl: 5.87`), against the BlueZ
5.87 source tarball. It is the reason `src/bluez/types.ts:findBatteryPath` and
the `Battery Level` row in `src/devices.tsx` are shaped the way they are.

## The bug

`getBatteryLevel(mac)` resolved the device path and called
`GetAll("org.bluez.Battery1")` on that path. That is one of the two places the
interface can live, so a device whose battery arrives through a provider
reported nothing, and the details panel had no number to follow.

## Where BlueZ exports `org.bluez.Battery1`

From `doc/org.bluez.Battery.rst` and `src/battery.c` in the 5.87 tarball:

| Registrant | Object path of `Battery1` | Needs |
| --- | --- | --- |
| `profiles/battery/battery.c:135`, the GATT Battery Service (`0x180f`) | the device path, `btd_battery_register(device_get_path(…))` | an LE device that carries the service |
| `src/battery.c`, a provider battery with no `Identifier` | the device path, `battery_register(device_path, …)` | `RegisterBatteryProvider()` on the adapter |
| `src/battery.c`, a provider battery with an `Identifier` | `<device>/battery_<identifier>`, from `battery_build_component_path()` | `--experimental`; without it bluetoothd logs `Ignoring experimental component battery` |

The documented path in `org.bluez.Battery.rst` is
`[variable prefix]/{hci0,hci1,…}/dev_{BDADDR}`, i.e. the device object, which is
why the device object is checked first and wins when both answer. Children are
taken in path order so a device with two batteries reports the same one every
refresh.

`Percentage` is a `byte`, and `property_percentage_exists` is
`percentage <= BATTERY_MAX_PERCENTAGE` (`src/battery.c:133`): the property is
absent from `GetAll` until a real reading arrives. `btd_battery_update` rejects
anything above 100 (`src/battery.c:237`), so there is no `255 = unknown` case to
translate. `Charging` and `Device`/`Identifier` are marked experimental.

## What this machine has

| Probe | Result |
| --- | --- |
| `GetManagedObjects` on `org.bluez` | 7 objects, none exports `org.bluez.Battery1` |
| Connected device `1C:52:16:B4:7F:F7` (QCY FairyBuds) | `Device1`, `Input1`, `MediaControl1`, `Bearer.BREDR1`; `Class 2360324`, `Icon audio-headset`, no GATT services resolved |
| Adapter `/org/bluez/hci0` | exports `org.bluez.BatteryProviderManager1` — the provider API is present, and nothing has registered with it |
| `systemctl show bluetooth -p ExecStart` | `/usr/lib/bluetooth/bluetoothd`, no `--experimental`, so component paths could not appear here even with a provider |
| `upower -e`, `/sys/class/power_supply` | `line_power_AC0`, `DisplayDevice` / `AC0` — no Bluetooth battery anywhere in UPower |
| `pw-dump` for `bluez_card.1C_52_16_B4_7F_F7` | no property key containing `batt` |
| `findBatteryPath(<real GetManagedObjects>, <that device path>)` | `undefined` |

A Classic-only headset with no provider on the bus has no battery reading on
this host, so the row shows `—`. That is the honest output, not the bug: the bug
was that a machine which *does* have a provider would also have shown `—`.

## What could not be exercised

The provider round-trip. A probe that exported
`org.bluez.BatteryProvider1` (`Percentage 77`, `Device <the QCY path>`) and
called `RegisterBatteryProvider` died before it reached BlueZ:

```
DBusError: Request to own name refused by policy
  org.freedesktop.DBus.Error.AccessDenied
```

the system bus policy of this install refuses to let this user own a private
name. It was not run as root: a bus-policy or provider change is not something
to make to a machine to see a number. So the provider case is verified against
BlueZ's source and against the object-map shape `GetManagedObjects` returns —
`test/battery.test.ts` builds that shape by hand — but no process on this
network has ever fed a percentage into this code.

`GetManagedObjects` answers `a{oa{sa{sv}}}`, so property values arrive
Variant-wrapped (`{signature: "y", value: 77}`) while
`org.bluez.DBus.Properties.GetAll` values are unwrapped by
`client.ts:unwrapVariant`. `findBatteryPath` only tests interface presence, so
the wrapping does not reach it; reading `Percentage` goes through
`getAllProperties`, which does unwrap.

## Not verified

* A rendered details panel with a number in it — see above.
* `Charging`: 5.87 exports it as experimental and this stack has no battery at
  all, so nothing reads it.
