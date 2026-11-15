export interface SavedWindow {
  application: string;
  workspace: { id: number; name: string };
  width: number;
  height: number;
  restore: string;
}

export interface Snapshot {
  saved: boolean;
  savedAt: string;
  windows: number;
  managed: number;
  workspaces: number;
  autoCapture: boolean;
  captureIntervalSeconds: number;
  autoRestore: boolean;
  daemonRunning: boolean;
  statePath: string;
  savedWindows: SavedWindow[];
}

export interface RestoreOperation {
  kind: string;
  slot?: string;
  detail: string;
}

export interface RestorePlan {
  dryRun: boolean;
  matched: number;
  missing: number;
  launched: number;
  operations: RestoreOperation[];
}

export class DankSessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DankSessionError";
  }
}

type Json = Record<string, unknown>;

function object(text: string): Json {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new DankSessionError(`danksession printed something that is not JSON: ${text.trim().slice(0, 160)}`);
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new DankSessionError("danksession printed JSON that is not an object.");
  }
  const record = value as Json;
  const failure = record["error"];
  if (typeof failure === "string" && failure.length > 0) throw new DankSessionError(failure);
  return record;
}

function field(source: Json, key: string): unknown {
  const value = source[key];
  if (value === undefined) throw new DankSessionError(`danksession output has no "${key}".`);
  return value;
}

function text(source: Json, key: string): string {
  const value = field(source, key);
  if (typeof value !== "string") throw new DankSessionError(`danksession "${key}" is not a string.`);
  return value;
}

function count(source: Json, key: string): number {
  const value = field(source, key);
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new DankSessionError(`danksession "${key}" is not a number.`);
  }
  return value;
}

function flag(source: Json, key: string): boolean {
  const value = field(source, key);
  if (typeof value !== "boolean") throw new DankSessionError(`danksession "${key}" is not a boolean.`);
  return value;
}

function array(source: Json, key: string): unknown[] {
  const value = field(source, key);
  if (!Array.isArray(value)) throw new DankSessionError(`danksession "${key}" is not an array.`);
  return value;
}

function savedWindow(value: unknown): SavedWindow {
  if (typeof value !== "object" || value === null) throw new DankSessionError("danksession saved a window that is not an object.");
  const window = value as Json;
  const workspace = field(window, "workspace");
  if (typeof workspace !== "object" || workspace === null) {
    throw new DankSessionError("danksession saved a window without a workspace.");
  }
  const place = workspace as Json;
  return {
    application: text(window, "application"),
    workspace: { id: count(place, "id"), name: text(place, "name") },
    width: count(window, "width"),
    height: count(window, "height"),
    restore: text(window, "restore"),
  };
}

function operation(value: unknown): RestoreOperation {
  if (typeof value !== "object" || value === null) throw new DankSessionError("danksession printed a restore operation that is not an object.");
  const entry = value as Json;
  const slot = entry["slot"];
  return {
    kind: text(entry, "kind"),
    ...(typeof slot === "string" ? { slot } : {}),
    detail: text(entry, "detail"),
  };
}

export function parseStatus(json: string): Snapshot {
  const status = object(json);
  return {
    saved: flag(status, "saved"),
    savedAt: text(status, "savedAt"),
    windows: count(status, "windows"),
    managed: count(status, "managed"),
    workspaces: count(status, "workspaces"),
    autoCapture: flag(status, "autoCapture"),
    captureIntervalSeconds: count(status, "captureIntervalSeconds"),
    autoRestore: flag(status, "autoRestore"),
    daemonRunning: flag(status, "daemonRunning"),
    statePath: text(status, "statePath"),
    savedWindows: array(status, "savedWindows").map(savedWindow),
  };
}

export function parseRestorePlan(json: string): RestorePlan {
  const plan = object(json);
  return {
    dryRun: plan["dryRun"] === true,
    matched: count(plan, "matched"),
    missing: count(plan, "missing"),
    launched: count(plan, "launched"),
    operations: array(plan, "operations").map(operation),
  };
}

export function parseCapture(json: string): number {
  return count(object(json), "windows");
}

/** `savedAt` is the Go zero time when nothing was ever captured. */
export function formatAge(iso: string, now = Date.now()): string {
  const saved = Date.parse(iso);
  if (Number.isNaN(saved) || new Date(saved).getUTCFullYear() <= 1) return "never";
  const seconds = Math.max(0, Math.round((now - saved) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

export function restoreLabel(kind: string): string {
  if (kind === "relaunch") return "Relaunch";
  if (kind === "placement") return "Placement only";
  return kind;
}

export function restoreSummary(plan: RestorePlan): string {
  const parts = [`${plan.matched} matched`];
  if (plan.missing > 0) parts.push(`${plan.missing} missing`);
  if (plan.launched > 0) parts.push(`${plan.launched} to launch`);
  return parts.join(" · ");
}
