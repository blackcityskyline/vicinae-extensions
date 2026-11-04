export type PowerAction = "poweroff" | "reboot" | "suspend";

export type Schedule = {
  id: number;
  action: PowerAction;
  dueEpochSec: number;
  armedAtSec: number;
  dryRun: boolean;
};

export type HistoryEvent = {
  at: number;
  action: string;
  outcome: string;
  detail?: string;
};

const POWER_ACTIONS: readonly PowerAction[] = ["poweroff", "reboot", "suspend"];

function parseArray(stored: string | null | undefined): unknown[] {
  // LocalStorage.getItem resolves null (measured) on a fresh install, and
  // JSON.parse throws on "", so both are answered with an empty list here.
  if (!stored) return [];
  try {
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function isSchedule(value: unknown): value is Schedule {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "number" &&
    POWER_ACTIONS.includes(record.action as PowerAction) &&
    typeof record.dueEpochSec === "number" &&
    typeof record.armedAtSec === "number" &&
    typeof record.dryRun === "boolean"
  );
}

function isHistoryEvent(value: unknown): value is HistoryEvent {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.at === "number" &&
    typeof record.action === "string" &&
    typeof record.outcome === "string" &&
    (record.detail === undefined || typeof record.detail === "string")
  );
}

export function decodeSchedules(stored: string | null | undefined): Schedule[] {
  return parseArray(stored).filter(isSchedule);
}

export function decodeHistory(stored: string | null | undefined): HistoryEvent[] {
  return parseArray(stored).filter(isHistoryEvent);
}

export function sortSchedules(schedules: Schedule[]): Schedule[] {
  return [...schedules].sort((a, b) => a.dueEpochSec - b.dueEpochSec);
}

export function addHistory(history: HistoryEvent[], event: HistoryEvent, limit: number): HistoryEvent[] {
  return [event, ...history].slice(0, Math.max(limit, 0));
}
