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

export type BlockDevice = {
  name: string;
  path: string;
  size: string;
  model: string;
  type: string;
  tran: string;
  mountpoints: string[];
};

export function listAllBlockDevices(): BlockDevice[] {
  try {
    const out = execFileSync("lsblk", ["-o", "NAME,SIZE,MODEL,TYPE,TRAN,MOUNTPOINTS", "-J"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const parsed = JSON.parse(out) as { blockdevices?: any[] };
    const devices = parsed.blockdevices ?? [];
    const result: BlockDevice[] = [];
    const walk = (d: any) => {
      result.push({
        name: String(d.name),
        path: `/dev/${d.name}`,
        size: String(d.size ?? ""),
        model: String(d.model ?? "").trim(),
        type: String(d.type ?? ""),
        tran: String(d.tran ?? ""),
        mountpoints: Array.isArray(d.mountpoints) ? d.mountpoints.filter(Boolean) : d.mountpoint ? [d.mountpoint] : [],
      });
      for (const c of d.children ?? []) walk(c);
    };
    for (const d of devices) walk(d);
    return result;
  } catch {
    return [];
  }
}

export function deviceMountpoints(dev: string): string[] {
  try {
    const out = execFileSync("lsblk", ["-ln", "-o", "MOUNTPOINTS", dev], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function isMounted(dev: string): boolean {
  return deviceMountpoints(dev).length > 0;
}
