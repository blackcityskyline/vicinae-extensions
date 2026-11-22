# Bluetooth

Bluetooth through the BlueZ daemon over D-Bus (`org.bluez`); the machine must
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

The details panel has a `Battery Level` row per paired device; a device whose
level is known carries the same percentage in the list row when details are
hidden — the number when BlueZ knows it, `—` when it does not — refreshed with
the list every two seconds and after each action.

BlueZ exports it only when something runs: the GATT Battery Service plugin
(service `0x180F`, LE devices) or a provider registered with
`org.bluez.BatteryProviderManager1`. A Classic-only headset on a host with
neither shows `—`; that is the stack, not the extension.

For a Classic headset the provider comes from the audio server — BlueZ has no
HFP battery code of its own (it acknowledges an AVRCP battery status and
discards it). PipeWire registers a provider when an HFP link carries the
headset's level (`AT+IPHONEACCEV` or an HF indicator); WirePlumber must allow
the headset role (`bluez5.headset-roles`, no device rule masking
`api.bluez5.roles`). Measured on a QCY FairyBuds: with HFP allowed, BlueZ
exported `Battery1` at 100 % and the list showed it; masked, the device
exports no battery at all. HFP also replaces the A2DP profile on that machine —
a trade against audio quality, not a free reading.

## Install

`npm install && npm run build` installs the bundle into
`~/.local/share/vicinae/extensions`.
