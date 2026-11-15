// Pure helpers over systemd unit data: no @vicinae/api, so they can be tested headless.

import {
  ServiceLoadStatus,
  ServiceStatus,
  ServiceSubStatus,
  type Service,
  type ServiceFilter,
  type ServiceType,
  type SystemdUnit,
} from "../types";

const STATUS: Record<string, ServiceStatus> = {
  active: ServiceStatus.ACTIVE,
  inactive: ServiceStatus.INACTIVE,
  failed: ServiceStatus.FAILED,
};

const SUB_STATUS: Record<string, ServiceSubStatus> = {
  running: ServiceSubStatus.RUNNING,
  exited: ServiceSubStatus.EXITED,
  dead: ServiceSubStatus.DEAD,
};

const LOAD_STATUS: Record<string, ServiceLoadStatus> = {
  loaded: ServiceLoadStatus.LOADED,
  "not-found": ServiceLoadStatus.NOT_FOUND,
};

// Format bytes into human readable format
export function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

// Parse one ListUnits row into a Service, or null for units this view does not show.
export function parseUnitInfo(unit: SystemdUnit, type: ServiceType): Service | null {
  const [name = "", description = "", loadState = "", activeState = "", subState = "", following = "", , jobType = "", jobObjectPath = ""] =
    unit;

  if (!name.endsWith(".service")) return null;

  return {
    name,
    description: description || name,
    status: STATUS[activeState] ?? ServiceStatus.UNKNOWN,
    subStatus: SUB_STATUS[subState] ?? ServiceSubStatus.UNKNOWN,
    loadStatus: LOAD_STATUS[loadState] ?? ServiceLoadStatus.UNKNOWN,
    type,
    icon: "", // filled by the services hook
    following: following || undefined,
    jobType: jobType || undefined,
    jobObjectPath: jobObjectPath || undefined,
  };
}

export function filterServices(services: Service[], filter: ServiceFilter): Service[] {
  if (filter === "all") return services;

  return services.filter((service) => {
    switch (filter) {
      case "system":
        return service.type === "system";
      case "user":
        return service.type === "user";
      case "running":
        return service.status === ServiceStatus.ACTIVE;
      case "stopped":
        return service.status === ServiceStatus.INACTIVE;
      default:
        return true;
    }
  });
}
