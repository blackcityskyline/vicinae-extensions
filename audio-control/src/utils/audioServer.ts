const MAC_ADDRESS = /^[0-9A-F]{2}(?::[0-9A-F]{2}){5}$/;
const DEVICE_LINE = /^Device\s+([0-9A-F]{2}(?::[0-9A-F]{2}){5})\s+(.+?)\s*$/i;

export type BluetoothDevice = {
  address: string;
  name: string;
  connected: boolean;
};

type SinkLike = {
  name: string;
  properties?: Record<string, string | number | boolean>;
};

export function isPipeWireServer(serverName: string | undefined): boolean {
  return serverName?.toLowerCase().includes("pipewire") ?? false;
}

/**
 * PipeWire exposes the device address on the sink; the sink name carries it too,
 * as `bluez_output.1C_52_16_B4_7F_F7.1`, when the property is absent.
 */
export function bluetoothAddressForSink(device: SinkLike): string | undefined {
  const fromProperty = device.properties?.["api.bluez5.address"];
  if (typeof fromProperty === "string" && MAC_ADDRESS.test(fromProperty)) {
    return fromProperty;
  }

  const match = /^bluez_output\.([0-9A-F_]{17})(?:\.|$)/i.exec(device.name);
  const fromName = match?.[1]?.split("_").join(":").toUpperCase();
  return fromName && MAC_ADDRESS.test(fromName) ? fromName : undefined;
}

/**
 * `bluetoothctl connect` can exit 0 while printing a failure, and "already
 * connected" is a success for a reconnect: the sink is what we need next.
 */
export function bluetoothConnectFailed(output: string): boolean {
  return (
    /failed to connect|not available/i.test(output) &&
    !/alreadyconnected/i.test(output)
  );
}

const AUDIO_UUIDS = [
  "0000110a",
  "0000110b",
  "0000111e",
  "0000184e",
  "00001850",
  "00001853",
];

export function parseBluetoothDeviceList(
  output: string,
): { address: string; name: string }[] {
  const devices: { address: string; name: string }[] = [];
  for (const line of output.split("\n")) {
    const match = DEVICE_LINE.exec(line.trim());
    const address = match?.[1]?.toUpperCase();
    if (!address) continue;
    devices.push({ address, name: match?.[2]?.trim() || address });
  }
  return devices;
}

function parseBluetoothInfo(
  address: string,
  fallbackName: string,
  output: string,
): BluetoothDevice & { audio: boolean } {
  let name = fallbackName;
  let connected = false;
  let audio = false;

  for (const line of output.split("\n")) {
    const match = /^\s*([^:]+):\s*(.*)$/.exec(line);
    if (!match) continue;
    const key = match[1]?.trim();
    const value = match[2]?.trim() ?? "";

    if (key === "Name" && value) name = value;
    else if (key === "Alias" && value) name = value;
    else if (key === "Connected") connected = /^yes$/i.test(value);
    else if (key === "Icon" && /audio/i.test(value)) audio = true;

    const uuid = /\(([0-9a-f-]{4,})\)/i.exec(line)?.[1]?.toLowerCase();
    if (uuid && AUDIO_UUIDS.some((known) => uuid.startsWith(known))) {
      audio = true;
    }
  }

  return { address, name, connected, audio };
}

/**
 * Paired devices stay visible when disconnected; that is the point of the
 * screen. `devices Paired` also lists keyboards and mice, so each one gets a
 * `bluetoothctl info` and only audio profiles survive. Connected rows sort
 * first.
 */
export function parsePairedBluetoothDevices(
  devices: readonly { address: string; name: string }[],
  infoByAddress: ReadonlyMap<string, string>,
): BluetoothDevice[] {
  return devices
    .map(({ address, name }) =>
      parseBluetoothInfo(address, name, infoByAddress.get(address) ?? ""),
    )
    .filter((device) => device.audio)
    .map(({ audio: _audio, ...device }) => device)
    .sort(
      (left, right) =>
        Number(right.connected) - Number(left.connected) ||
        left.name.localeCompare(right.name) ||
        left.address.localeCompare(right.address),
    );
}
