import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { getPreferenceValues, showToast, Toast } from "@vicinae/api";

import type { Service } from "../types";
import { explainFailure, serviceCommand, type Escalation, type ServiceAction } from "./command";

export type { ServiceAction } from "./command";

const execFileAsync = promisify(execFile);
const MAX_BUFFER = 4 * 1024 * 1024;

const ACTION_VERB: Record<ServiceAction, string> = {
  start: "Starting",
  stop: "Stopping",
  restart: "Restarting",
  reload: "Reloading",
  enable: "Enabling",
  disable: "Disabling",
};

export function getEscalation(): Escalation {
  const { privilegeEscalation } = getPreferenceValues<{ privilegeEscalation?: string }>();
  return privilegeEscalation === "pkexec" ? "pkexec" : "polkit";
}

async function run(argv: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const [file, ...args] = argv;
  if (!file) return { code: 1, stdout: "", stderr: "No command to run" };
  try {
    const { stdout, stderr } = await execFileAsync(file, args, {
      encoding: "utf8",
      maxBuffer: MAX_BUFFER,
      timeout: 120_000,
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failure = error as NodeJS.ErrnoException & { code?: number | string; stdout?: string; stderr?: string };
    if (typeof failure.code === "number") {
      return { code: failure.code, stdout: failure.stdout ?? "", stderr: failure.stderr ?? failure.message };
    }
    return { code: 1, stdout: failure.stdout ?? "", stderr: failure.stderr ?? failure.message };
  }
}

/** Runs one action and reports both outcomes itself, so callers only refresh. */
export async function performServiceAction(service: Service, action: ServiceAction): Promise<boolean> {
  await showToast({ style: Toast.Style.Animated, title: `${ACTION_VERB[action]} ${service.name}…` });
  const result = await run(serviceCommand(action, service.name, service.type, getEscalation()));
  if (result.code === 0) {
    await showToast({ style: Toast.Style.Success, title: `${service.name}: ${action}ed` });
    return true;
  }
  await showToast({
    style: Toast.Style.Failure,
    title: `Could not ${action} ${service.name}`,
    message: explainFailure(result.stderr || result.stdout),
  });
  return false;
}

/** Recent log lines for one unit, with systemd's own prefix stripped. */
export async function getServiceLogs(service: Service, lines = 50): Promise<string> {
  const argv = [
    "journalctl",
    ...(service.type === "user" ? ["--user"] : []),
    "-u",
    service.name,
    "-b",
    "-n",
    String(lines),
    "--no-pager",
  ];
  const result = await run(argv);
  if (result.code !== 0) return explainFailure(result.stderr || result.stdout);

  const cleaned = result.stdout
    .trim()
    .split("\n")
    .map((line) => line.replace(/^.*\[\d+\]:\s+/, ""))
    .filter((line) => line.trim().length > 0)
    .join("\n");
  return cleaned || "No logs for this unit since the last boot.";
}
