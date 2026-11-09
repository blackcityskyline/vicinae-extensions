import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

import { parseSink, batteryPercent, bluetoothAddress, deviceName, type OutputInfo } from "~/utils/output";
import { STOPPED, parseState, type EffectsState } from "~/utils/state";

const exec = promisify(execFile);

/**
 * Every Easy Effects CLI call answers in well under a second. The timeout is
 * not cosmetic: when Easy Effects is stopped, a CLI call does not fail, it
 * becomes the main instance and never exits. Killing it after a few seconds
 * is the only way a launcher can stay responsive, and it leaves Easy Effects
 * in the state the user found it in — stopped.
 */
const CALL_TIMEOUT = 5_000;

/** pgrep is the cheap guard that keeps the CLI from starting a main instance. */
export async function isRunning(): Promise<boolean> {
  try {
    await exec("pgrep", ["-x", "easyeffects"], { timeout: 2_000 });
    return true;
  } catch {
    return false;
  }
}

export async function readState(): Promise<EffectsState> {
  if (!(await isRunning())) return STOPPED;
  try {
    const [bypass, preset, presets] = await Promise.all([
      exec("easyeffects", ["-b", "3"], { timeout: CALL_TIMEOUT }),
      exec("easyeffects", ["-a", "output"], { timeout: CALL_TIMEOUT }),
      exec("easyeffects", ["-p"], { timeout: CALL_TIMEOUT }),
    ]);
    const trim = (value: string) => value.replace(/\n+$/, "");
    return parseState(
      ["running", trim(bypass.stdout), trim(preset.stdout), trim(presets.stdout)].join("\n"),
    );
  } catch {
    // The app quit between the guard and the calls: report what the next
    // read will find, rather than a half-read state.
    return STOPPED;
  }
}

/** Null means Easy Effects is not running. The boolean is the new bypass state. */
export async function toggleBypass(): Promise<boolean | null> {
  if (!(await isRunning())) return null;
  await exec("easyeffects", ["--bypass-toggle"], { timeout: CALL_TIMEOUT });
  const { stdout } = await exec("easyeffects", ["-b", "3"], { timeout: CALL_TIMEOUT });
  return stdout.trim() === "1";
}

/** False means Easy Effects is not running. */
export async function loadPreset(name: string): Promise<boolean> {
  if (!(await isRunning())) return false;
  await exec("easyeffects", ["-l", name], { timeout: CALL_TIMEOUT });
  return true;
}

/**
 * Quit (SIGTERM through the app's own CLI) or force-kill. The CLI is only
 * called while the app is running: `easyeffects -q` on a stopped app would
 * become the main instance and hang, the same quirk as every other call.
 * Returns true when the process is gone; the caller decides what to say when
 * it is not.
 */
export async function quitApp(force = false): Promise<boolean> {
  if (!(await isRunning())) return true;
  try {
    if (force) await exec("pkill", ["-x", "easyeffects"], { timeout: 3_000 });
    else await exec("easyeffects", ["-q"], { timeout: CALL_TIMEOUT });
  } catch {
    // The wait below answers the only question that matters: is it gone?
  }
  for (let attempt = 0; attempt < 15; attempt++) {
    if (!(await isRunning())) return true;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
}

/**
 * Easy Effects outlives the window: detached, no stdio. `--service-mode
 * --hide-window` is the same background form Omarchy's autostart uses.
 */
export function openApp(background: boolean, onFailure: (error: Error) => void): void {
  const args = background ? ["--service-mode", "--hide-window"] : [];
  const child = spawn("easyeffects", args, { detached: true, stdio: "ignore" });
  child.on("error", onFailure);
  child.unref();
}

/**
 * The output device and, for Bluetooth, its battery. pactl is the source the
 * bar plugin took from Quickshell; bluetoothctl answers the battery part.
 * Missing tools or a device without a battery are not errors: the list simply
 * shows less.
 */
export async function readOutput(): Promise<OutputInfo | null> {
  try {
    const [name, sinks] = await Promise.all([
      exec("pactl", ["get-default-sink"], { timeout: 3_000 }),
      exec("pactl", ["--format=json", "list", "sinks"], { timeout: 3_000, maxBuffer: 1024 * 1024 }),
    ]);
    const sink = parseSink(sinks.stdout, name.stdout.trim());
    if (!sink) return null;

    const address = bluetoothAddress(sink);
    if (!address) return { description: sink.description };

    try {
      const info = await exec("bluetoothctl", ["info", address], { timeout: 3_000 });
      const nameFromBlueZ = deviceName(info.stdout);
      return {
        description: sink.description,
        address,
        device: nameFromBlueZ === address ? undefined : nameFromBlueZ,
        battery: batteryPercent(info.stdout),
      };
    } catch {
      return { description: sink.description, address };
    }
  } catch {
    return null;
  }
}
