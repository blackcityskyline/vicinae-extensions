/** The default sink, with Bluetooth details when there are any. */
export interface Sink {
  name: string;
  description: string;
  properties: Record<string, string>;
}

export interface OutputInfo {
  description: string;
  /** Set only for a Bluetooth sink. */
  address?: string;
  /** The Bluetooth device's own name, when BlueZ answers. */
  device?: string;
  /** BlueZ battery percentage, -1 when the device does not report one. */
  battery?: number;
}

const MAC = /^[0-9A-F]{2}(?::[0-9A-F]{2}){5}$/i;
const BLUEZ_SINK = /^bluez_output\.([0-9A-F_]{17})(?:\.|$)/i;

/**
 * PipeWire names a Bluetooth sink `bluez_output.<MAC with underscores>`, and
 * usually repeats the address in `api.bluez5.address`. The property comes
 * first; the name is the fallback.
 */
export function bluetoothAddress(sink: Sink): string | undefined {
  const property = sink.properties["api.bluez5.address"];
  if (typeof property === "string" && MAC.test(property)) {
    return property.toUpperCase();
  }
  const match = BLUEZ_SINK.exec(sink.name);
  const fromName = match?.[1]?.split("_").join(":").toUpperCase();
  return fromName && MAC.test(fromName) ? fromName : undefined;
}

/**
 * `pactl --format=json list sinks` is an array; the default sink is selected
 * by the name `pactl get-default-sink` prints. A malformed reply is no output
 * at all, never an exception the list has to handle.
 */
export function parseSink(json: string, defaultName: string): Sink | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return undefined;
  }
  if (!Array.isArray(parsed)) return undefined;

  const sink = parsed.find(
    (entry): entry is Sink =>
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as Sink).name === "string" &&
      (entry as Sink).name === defaultName &&
      typeof (entry as Sink).description === "string",
  );
  if (!sink) return undefined;

  const properties: Record<string, string> = {};
  const raw = (sink as { properties?: unknown }).properties;
  if (typeof raw === "object" && raw !== null) {
    for (const [key, value] of Object.entries(raw)) {
      if (typeof value === "string") properties[key] = value;
    }
  }
  return { name: sink.name, description: sink.description, properties };
}

const BATTERY = /Battery Percentage: 0x[A-Fa-f0-9]{2}\s*\((\d+)\)/;

/** BlueZ prints `Battery Percentage: 0x5a (90)`; the decimal is the one. */
export function batteryPercent(info: string): number | undefined {
  const match = BATTERY.exec(info);
  if (!match?.[1]) return undefined;
  const value = Number.parseInt(match[1], 10);
  return Number.isFinite(value) ? value : undefined;
}

/** The friendly name BlueZ knows for the address. */
export function deviceName(info: string): string | undefined {
  for (const line of info.split("\n")) {
    const match = /^\s*(Alias|Name):\s*(.+)$/.exec(line);
    if (match?.[2]) return match[2].trim();
  }
  return undefined;
}
