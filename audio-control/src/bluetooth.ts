import type { PactlClient, PactlDevice } from "./pactl";
import { bluetoothAddressForSink } from "./utils/audioServer";
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
    const stderr = typeof err.stderr === "string" ? err.stderr.trim() : "";
    throw new BluetoothError(
      `bluetoothctl ${args[0]} failed.${stderr ? ` ${stderr}` : ""}`,
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  const output = await bluetoothctl(["connect", address], 20_000);
  if (/failed to connect|not available/i.test(output)) {
    throw new BluetoothError(`Could not connect ${address}. ${output.trim()}`);
  }

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
