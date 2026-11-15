import { getPreferenceValues } from "@vicinae/api";

export type Prefs = {
  edgepadPath: string;
  configDir: string;
  serviceName: string;
};

export function getPrefs(): Prefs {
  const prefs = getPreferenceValues<Partial<Prefs>>();
  return {
    edgepadPath: prefs.edgepadPath?.trim() ?? "",
    configDir: prefs.configDir?.trim() ?? "",
    serviceName: prefs.serviceName?.trim() || "edgepad.service",
  };
}
