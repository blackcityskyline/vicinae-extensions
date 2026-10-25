import type { PactlClient, PactlDevice } from "./pactl";
import {
  bluetoothAddressForSink,
  bluetoothConnectFailed,
  parseBluetoothDeviceList,
  parsePairedBluetoothDevices,
  type BluetoothDevice,
} from "./utils/audioServer";
import { execFileAsync } from "./utils/execFileAsync";

export class BluetoothError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BluetoothError";
  }
}

async function bluetoothctl(args: string[], timeout: number): Promise<string> {
  try {
    const { stdout, stderr } = await execFileAsync("bluetoothctl", args, {
      timeout,
      maxBuffer: 1024 * 1024,
    });
    return `${stdout}${stderr}`;
  } catch (error) {
    const err = error as NodeJS.ErrnoException & {
      stdout?: unknown;
      stderr?: unknown;
      killed?: boolean;
    };
    if (err.code === "ENOENT") {
      throw new BluetoothError(
        "`bluetoothctl` was not found in PATH. Install BlueZ to reconnect Bluetooth devices.",
      );
    }
    if (err.code === "ETIMEDOUT" || err.killed) {
      throw new BluetoothError(`bluetoothctl ${args[0]} timed out.`);
    }
    const output = [err.stdout, err.stderr]
      .filter((part): part is string => typeof part === "string")
      .join(" ")
      .replace(/\x1b\[[0-9;]*m/g, "")
      .trim();
    throw new BluetoothError(
      `bluetoothctl ${args[0]} failed.${output ? ` ${output}` : ""}`,
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function listPairedBluetoothDevices(): Promise<
  BluetoothDevice[]
> {
  const devices = parseBluetoothDeviceList(
    await bluetoothctl(["devices", "Paired"], 5_000),
  );
  const infoByAddress = new Map<string, string>();
  await Promise.all(
    devices.map(async ({ address }) => {
      try {
        infoByAddress.set(
          address,
          await bluetoothctl(["info", address], 5_000),
        );
      } catch {
        // One unreadable device must not empty the whole list.
      }
    }),
  );
  return parsePairedBluetoothDevices(devices, infoByAddress);
}

export async function reconnectBluetoothSink(args: {
  address: string;
  pactl: PactlClient;
}): Promise<PactlDevice> {
  const { address, pactl } = args;

  try {
    await bluetoothctl(["disconnect", address], 10_000);
  } catch {
    // Already disconnected is not a reason to refuse the connect.
  }

  await sleep(300);

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const output = await bluetoothctl(["connect", address], 20_000);
      if (bluetoothConnectFailed(output)) {
        throw new BluetoothError(
          `Could not connect ${address}. ${output.trim()}`,
        );
      }
      lastError = undefined;
      break;
    } catch (error) {
      lastError = error;
      await sleep(500);
    }
  }
  if (lastError) throw lastError;

  for (let attempt = 0; attempt < 20; attempt++) {
    const sink = (await pactl.listSinks()).find(
      (candidate) => bluetoothAddressForSink(candidate) === address,
    );
    if (sink) return sink;
    await sleep(250);
  }

  throw new BluetoothError(
    `${address} connected, but no audio sink appeared within 5 seconds.`,
  );
}
