# Bluetooth

Bluetooth through the BlueZ daemon over D-Bus (`org.bluez`), so the machine must
run BlueZ.

## Commands

| Command | Mode | Does |
| --- | --- | --- |
| Bluetooth On | no-view | powers the adapter on, optionally reconnecting the last device |
| Bluetooth Off | no-view | powers the adapter off |
| Scan | view | nearby devices, with pairing |
| Devices | view | paired devices, with connect, disconnect, remove |
| Discoverable | view | makes the adapter discoverable for pairing |

## Battery level

The details panel has a `Battery Level` row per paired device: the percentage
when BlueZ knows it, `—` when it does not, refreshed with the list every two
seconds and after each action.

BlueZ knows it only when something exports `org.bluez.Battery1`: the GATT
Battery Service plugin (service `0x180F`, so LE devices), or a battery provider
registered with `org.bluez.BatteryProviderManager1`. A Classic-only headset on a
host with neither shows `—`; that is the stack, not the extension.
[`docs/audits/bluetooth-battery.md`](../docs/audits/bluetooth-battery.md) records
what this machine has.

## Install

`npm install && npm run build` installs the bundle into
`~/.local/share/vicinae/extensions`.
