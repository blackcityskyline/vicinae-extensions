// Helpers that need @vicinae/api: icons, colors and D-Bus proxies.

import { Color, Icon } from "@vicinae/api";
import { MessageBus } from "dbus-next";

import type { Service, SystemdManagerInterface, SystemdServiceInterface } from "./types";
import { ServiceStatus } from "./types";

// Use one icon for every row; status is carried by its tint and the accessories.
export function getServiceIcon(): string {
  return Icon.Cog;
}

export function getServiceColor(status: ServiceStatus): Color {
  switch (status) {
    case ServiceStatus.ACTIVE:
      return Color.Green;
    case ServiceStatus.FAILED:
      return Color.Red;
    case ServiceStatus.INACTIVE:
      return Color.SecondaryText;
    default:
      return Color.Orange;
  }
}

// Get systemd manager proxy for a bus
export async function getSystemdManager(bus: MessageBus): Promise<SystemdManagerInterface> {
  const systemd = await bus.getProxyObject("org.freedesktop.systemd1", "/org/freedesktop/systemd1");
  return systemd.getInterface("org.freedesktop.systemd1.Manager") as unknown as SystemdManagerInterface;
}

// Fetch the counters the detail pane shows. Missing on some units, so failures are ignored.
export async function fetchAdditionalUnitProperties(
  service: Service,
  bus: MessageBus,
  unitPath: string | undefined,
): Promise<void> {
  if (!unitPath) return;
  try {
    const unitProxy = await bus.getProxyObject("org.freedesktop.systemd1", unitPath);
    const serviceInterface = unitProxy.getInterface("org.freedesktop.systemd1.Service");
    const props = serviceInterface as unknown as SystemdServiceInterface;
    service.execMainPID = props.ExecMainPID;
    service.execMainStartTimestamp = props.ExecMainStartTimestamp;
    service.cpuUsageNSec = props.CPUUsageNSec;
    service.controlGroup = props.ControlGroup;
    service.ioReadBytes = props.IOReadBytes;
    service.ioWriteBytes = props.IOWriteBytes;
  } catch {
    // Units without a Service interface simply show fewer fields.
  }
}
