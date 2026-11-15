import os from "node:os";
import { loadPanelState, syncServiceConfig } from "~/api/config";
import { resolvePreferences, type ResolvedPreferences } from "~/api/preferences";
import { probe } from "~/api/service";
import { pickSelectedInterface, rankInterfaces, type NetworkInterface } from "~/utils/network";
import type { ProbeResult, ServiceConfig } from "~/utils/types";

export type Snapshot = {
  probe: ProbeResult;
  interfaces: NetworkInterface[];
  selectedHost: string;
  preferences: ResolvedPreferences;
  config: ServiceConfig;
};

/**
 * Everything the panel shows, taken fresh: settings and panel choices are flushed to the shared config first
 * (so a running service picks them up immediately), then the service is asked what it is actually doing.
 */
export async function loadSnapshot(): Promise<Snapshot> {
  const preferences = resolvePreferences();
  const state = await loadPanelState();
  const interfaces = rankInterfaces(os.networkInterfaces());
  const selectedHost = pickSelectedInterface(state.host, interfaces);
  const config = await syncServiceConfig({ preferences, host: selectedHost });
  const probeResult = await probe();
  return { probe: probeResult, interfaces, selectedHost, preferences, config };
}
