import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface HotspotSpec {
  ssid: string;
  password: string;
  band?: "bg" | "a";
  device?: string;
}

/**
 * `nmcli device wifi help` (1.58.1):
 * hotspot [ifname <ifname>] [con-name <name>] [ssid <SSID>]
 *         [band a|bg|6GHz] [channel <channel>] [password <password>]
 */
export function hotspotArgs(spec: HotspotSpec): string[] {
  const ssid = spec.ssid.trim();
  if (!ssid) throw new Error("The hotspot needs a network name.");
  if (ssid.length > 32) throw new Error("A network name is at most 32 characters.");
  if (/[\u0000-\u001f]/.test(ssid)) {
    throw new Error("The network name cannot contain control characters.");
  }
  if (spec.password.length < 8 || spec.password.length > 63) {
    throw new Error("A hotspot password is 8 to 63 characters.");
  }
  if (/[\u0000-\u001f]/.test(spec.password)) {
    throw new Error("The password cannot contain control characters.");
  }

  const args = ["device", "wifi", "hotspot"];
  if (spec.device) args.push("ifname", spec.device);
  args.push("ssid", ssid, "password", spec.password);
  if (spec.band) args.push("band", spec.band);
  return args;
}

/** `nmcli -t -f DEVICE,TYPE device status` prints `wlp3s0:wifi` per line. */
export function firstWifiDevice(status: string): string | null {
  for (const line of status.split("\n")) {
    const [device, type] = line.trim().split(":");
    if (type === "wifi" && device) return device;
  }
  return null;
}

function lastLine(text: string): string {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return lines[lines.length - 1] ?? "nmcli failed";
}

async function nmcli(args: string[], timeout = 30_000): Promise<string> {
  try {
    const { stdout } = await execFileAsync("nmcli", args, { timeout });
    return stdout;
  } catch (error) {
    const failure = error as { stderr?: string; message?: string };
    throw new Error(lastLine(failure.stderr || failure.message || "nmcli failed"));
  }
}

/**
 * Runs nmcli with an argv array, never a shell string: a password containing
 * `$(…)` or a quote is data here, not syntax.
 */
export async function startHotspot(spec: HotspotSpec): Promise<string> {
  const device = firstWifiDevice(await nmcli(["-t", "-f", "DEVICE,TYPE", "device", "status"]));
  const ssid = spec.ssid.trim();
  await nmcli(hotspotArgs({ ...spec, ...(device ? { device } : {}) }), 60_000);
  return `Hotspot ${ssid} is active${device ? ` on ${device}` : ""}`;
}
