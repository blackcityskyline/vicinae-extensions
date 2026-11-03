import { execFileSync } from "node:child_process";

export type UsbDevice = {
  name: string;
  path: string;
  size: string;
  model: string;
};

export function listUsbDevices(): UsbDevice[] {
  try {
    const out = execFileSync("lsblk", ["-d", "-o", "NAME,SIZE,MODEL,TRAN,RM,TYPE", "-J"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const parsed = JSON.parse(out) as { blockdevices?: any[] };
    const devices = parsed.blockdevices ?? [];
    return devices
      .filter((d) => d && (d.rm === true || d.rm === 1 || d.tran === "usb"))
      .filter((d) => d.type === "disk")
      .map((d) => ({
        name: String(d.name),
        path: `/dev/${d.name}`,
        size: String(d.size ?? ""),
        model: String(d.model ?? "").trim(),
      }));
  } catch {
    return [];
  }
}
