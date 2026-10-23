const MAC_ADDRESS = /^[0-9A-F]{2}(?::[0-9A-F]{2}){5}$/;

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
