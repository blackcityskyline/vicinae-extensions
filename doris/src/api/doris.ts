import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Vicinae runs all day: every call here is one short-lived process, and no
 * timer is left behind. The timeout is the CLI's own worst case (a search
 * waits `--deadline-ms`, 60 s by default) plus room for a browser launch and
 * a Cloudflare walk, which is where a rutracker search's time goes.
 */
const TIMEOUT_MS = 180_000;
const MAX_OUTPUT = 32 * 1024 * 1024;

/** A row as `doris --json search` prints it. */
export type TrackedRow = {
  title: string;
  size: string;
  seeds: string;
  date: string;
  source: string;
  /** The `.torrent` link the source printed; absolute on rutor, a path elsewhere. */
  download_url: string;
  page_url: string;
  uploader: string;
  category: string;
  group: string | null;
  info_hash: string;
  magnet: string | null;
  size_bytes: number;
  seeds_n: number;
  leechers: number;
};

/** What `doris --json torrent list` says about one TorrServer torrent. */
export type Torrent = {
  name: string;
  hash: string;
  totalSize: number;
  loadedSize: number;
  downloadSpeed: number;
  uploadSpeed: number;
  activePeers: number;
  seeders: number;
  status: string;
  files: TorrentFile[];
};

export type TorrentFile = { id: number; path: string; length: number };

type CommandResult = { stdout: string; stderr: string; exitCode: number };

type TorrServerRow = {
  Name?: string;
  Hash?: string;
  TorrentSize?: number;
  LoadedSize?: number;
  DownloadSpeed?: number;
  UploadSpeed?: number;
  ActivePeers?: number;
  ConnectedSeeders?: number;
  TorrentStatusString?: string;
  files?: { id?: number; path?: string; length?: number }[];
};

export class DorisMissingError extends Error {
  constructor(bin: string) {
    super(
      `"${bin}" was not found. Install doris, or set its path in the extension preferences.`,
    );
    this.name = "DorisMissingError";
  }
}

/**
 * The CLI is the only interface: it is the same code the TUI's keys reach,
 * so there is no second search implementation here to disagree with it.
 * Every argument is passed as an array, never through a shell.
 */
async function run(bin: string, args: string[], signal?: AbortSignal): Promise<CommandResult> {
  try {
    const { stdout, stderr } = await execFileAsync(bin, args, {
      timeout: TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT,
      signal,
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (caught) {
    const error = caught as Error & {
      code?: string | number;
      killed?: boolean;
      stdout?: string;
      stderr?: string;
    };
    if (error.code === "ENOENT") throw new DorisMissingError(bin);
    if (error.killed) {
      throw new Error(
        `doris did not answer within ${Math.round(TIMEOUT_MS / 1000)} seconds.`,
      );
    }
    return {
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? "",
      exitCode: typeof error.code === "number" ? error.code : 1,
    };
  }
}

/** First line of the CLI's complaint, which is the part worth showing. */
export function firstLine(text: string): string {
  return (
    text
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? ""
  );
}

function readJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A row we can render: the CLI's output is another program's, so it is checked. */
function isTrackedRow(value: unknown): value is TrackedRow {
  return isRecord(value) && typeof value.title === "string";
}

/**
 * A search is read while it runs: `--stream` prints one JSON array per source
 * as that source answers, and `onRows` takes each batch the moment it lands.
 *
 * It has to be this way. The merged answer is only complete when the slowest
 * tracker is through, and on rutracker that is half a minute behind a
 * Cloudflare walk; the other four answer in the first second. Waiting for the
 * last one is a launcher holding an empty window for no reason. Measured
 * 22.11.2026: four batches in 0.6 s, the fifth at 35 s.
 *
 * No deadline is passed and none is chosen here: how long a tracker may take
 * is doris's decision, and cutting it short in the view once meant
 * rutracker's fifty rows never arrived at all.
 *
 * `onRows` may be called zero times; a search that found nothing prints its
 * one `[]` and exits 1, which is an empty result and not a failure.
 */
export function search(
  bin: string,
  query: string,
  onRows: (rows: TrackedRow[]) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    const child = spawn(bin, ["--json", "search", "--stream", query], {
      stdio: ["ignore", "pipe", "pipe"],
      signal,
    });

    let tail = "";
    let complaints = "";
    let sawAnswer = false;
    let timedOut = false;

    const take = (line: string) => {
      if (line.trim().length === 0) return;
      const parsed = readJson(line);
      sawAnswer = true;
      if (!Array.isArray(parsed)) return;
      const rows = parsed.filter(isTrackedRow);
      if (rows.length > 0) onRows(rows);
    };

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      const lines = (tail + chunk).split("\n");
      tail = lines.pop() ?? "";
      for (const line of lines) take(line);
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      complaints += chunk;
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, TIMEOUT_MS);
    timer.unref?.();

    child.on("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      if (error.name === "AbortError") return fail(error);
      if (error.code === "ENOENT") return fail(new DorisMissingError(bin));
      fail(error);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      take(tail);
      if (timedOut) {
        return fail(
          new Error(
            `doris did not answer within ${Math.round(TIMEOUT_MS / 1000)} seconds.`,
          ),
        );
      }
      // A line was printed: what it carried is the answer, even if the batch
      // was empty. Nothing at all means the CLI never got as far as asking.
      if (!sawAnswer) {
        return fail(
          new Error(
            firstLine(complaints) ||
              `doris search exited ${code ?? 1} without an answer.`,
          ),
        );
      }
      finish();
    });
  });
}

/**
 * The row is handed back to the CLI exactly as it printed it. The CLI already
 * knows the row's magnet, its `.torrent` link, its page and the source that
 * fetches it, so playing it needs no second search and no index into a list
 * whose order may have changed since it was drawn.
 */
export function playArgs(row: TrackedRow): string[] {
  return ["--json", "play", "--row", JSON.stringify(row)];
}

export function downloadArgs(row: TrackedRow): string[] {
  return ["--json", "download", "--row", JSON.stringify(row)];
}

export async function play(bin: string, row: TrackedRow): Promise<string> {
  return readStreamUrl(await run(bin, playArgs(row)));
}

/** The URL `doris play --json` printed, or the reason it has none. */
function readStreamUrl(result: CommandResult): string {
  const payload = readJson(result.stdout);
  if (!isRecord(payload)) {
    throw new Error(
      firstLine(result.stderr) ||
        `doris play exited ${result.exitCode} without an answer.`,
    );
  }
  if (typeof payload.error === "string" && payload.error) {
    throw new Error(payload.error);
  }
  if (typeof payload.url !== "string" || !payload.url) {
    throw new Error(firstLine(result.stderr) || "TorrServer returned no stream URL.");
  }
  return payload.url;
}

export async function download(bin: string, row: TrackedRow): Promise<number> {
  const result = await run(bin, downloadArgs(row));
  const payload = readJson(result.stdout);
  if (!isRecord(payload)) {
    throw new Error(
      firstLine(result.stderr) ||
        `doris download exited ${result.exitCode} without an answer.`,
    );
  }
  if (typeof payload.id === "number") return payload.id;
  const reason = typeof payload.reason === "string" ? payload.reason : "";
  throw new Error(reason || firstLine(result.stderr) || "nothing was added");
}

/**
 * TorrServer keeps a torrent's real title; a bare info-hash magnet is enough
 * for the CLI to find the same torrent again and launch its player, which is
 * the only play route it exposes for something already in the server.
 */
export function magnetFor(hash: string): string {
  return `magnet:?xt=urn:btih:${hash}`;
}

export async function playTorrent(bin: string, hash: string): Promise<string> {
  return readStreamUrl(await run(bin, ["--json", "play", "--magnet", magnetFor(hash)]));
}

function toTorrent(row: TorrServerRow, index: number): Torrent {
  return {
    name: row.Name?.trim() || row.Hash?.slice(0, 12) || `Torrent ${index + 1}`,
    hash: row.Hash ?? "",
    totalSize: row.TorrentSize ?? 0,
    loadedSize: row.LoadedSize ?? 0,
    downloadSpeed: row.DownloadSpeed ?? 0,
    uploadSpeed: row.UploadSpeed ?? 0,
    activePeers: row.ActivePeers ?? 0,
    seeders: row.ConnectedSeeders ?? 0,
    status: row.TorrentStatusString ?? "",
    files: (row.files ?? []).map((file) => ({
      id: file.id ?? 0,
      path: file.path ?? "",
      length: file.length ?? 0,
    })),
  };
}

export async function listTorrents(bin: string): Promise<Torrent[]> {
  const result = await run(bin, ["--json", "torrent", "list"]);
  const parsed = readJson(result.stdout);
  if (Array.isArray(parsed)) {
    return parsed
      .filter(isRecord)
      .map((row, index) => toTorrent(row as TorrServerRow, index))
      .filter((torrent) => torrent.hash !== "");
  }
  throw new Error(
    firstLine(result.stderr) ||
      `doris torrent list exited ${result.exitCode} without an answer.`,
  );
}

async function torrentCommand(
  bin: string,
  verb: "pause" | "resume" | "remove",
  hash: string,
): Promise<void> {
  const result = await run(bin, ["--json", "torrent", verb, hash]);
  if (result.exitCode === 0) return;
  throw new Error(
    firstLine(result.stderr) ||
      firstLine(result.stdout) ||
      `doris torrent ${verb} exited ${result.exitCode}.`,
  );
}

export function pauseTorrent(bin: string, hash: string): Promise<void> {
  return torrentCommand(bin, "pause", hash);
}

export function resumeTorrent(bin: string, hash: string): Promise<void> {
  return torrentCommand(bin, "resume", hash);
}

export function removeTorrent(bin: string, hash: string): Promise<void> {
  return torrentCommand(bin, "remove", hash);
}

/** One entry of `doris --json sources list`: the registry, as doris sees it. */
export type Source = {
  id: string;
  label: string;
  home: string;
  groups: string[];
  browser: boolean;
  implemented: boolean;
  enabled: boolean;
};

type SourceRow = {
  id?: string;
  label?: string;
  home?: string;
  groups?: unknown;
  browser?: boolean;
  implemented?: boolean;
  enabled?: boolean;
};

function toSource(row: SourceRow, index: number): Source {
  const id = row.id ?? "";
  return {
    id,
    label: row.label?.trim() || id || `Source ${index + 1}`,
    home: row.home ?? "",
    groups: Array.isArray(row.groups)
      ? row.groups.filter((group): group is string => typeof group === "string")
      : [],
    browser: row.browser === true,
    implemented: row.implemented === true,
    enabled: row.enabled === true,
  };
}

export async function listSources(bin: string): Promise<Source[]> {
  const result = await run(bin, ["--json", "sources", "list"]);
  const parsed = readJson(result.stdout);
  if (Array.isArray(parsed)) {
    return parsed
      .filter(isRecord)
      .map((row, index) => toSource(row as SourceRow, index))
      .filter((source) => source.id !== "");
  }
  throw new Error(
    firstLine(result.stderr) ||
      `doris sources list exited ${result.exitCode} without an answer.`,
  );
}

/**
 * A row's link as the browser needs it. Sources that answer with a path of
 * their own — rutracker prints `viewtopic.php?t=…` — are resolved against the
 * `home` the registry gives for them; nothing here knows a tracker's layout.
 */
export function resolveSourceUrl(url: string, home: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  if (url === "" || !/^https?:\/\//i.test(home)) return "";
  try {
    return new URL(url, home.slice(0, home.lastIndexOf("/") + 1)).toString();
  } catch {
    return "";
  }
}

export function sourceArgs(id: string, enabled: boolean): string[] {
  return ["--json", "sources", enabled ? "on" : "off", id];
}

/**
 * What a sources form submitted, against what `sources list` answered: one
 * entry per box that moved, so Apply touches only the trackers the user
 * actually ticked. `values` is `Form`'s shape — one boolean per source id.
 */
export function changedSources(
  sources: Source[],
  values: Record<string, unknown>,
): Array<{ id: string; enabled: boolean }> {
  const changes: Array<{ id: string; enabled: boolean }> = [];
  for (const source of sources) {
    const enabled = values[source.id] === true;
    if (enabled !== source.enabled) changes.push({ id: source.id, enabled });
  }
  return changes;
}

export async function setSourceEnabled(
  bin: string,
  id: string,
  enabled: boolean,
): Promise<void> {
  const result = await run(bin, sourceArgs(id, enabled));
  if (result.exitCode === 0) return;
  throw new Error(
    firstLine(result.stderr) ||
      firstLine(result.stdout) ||
      `doris sources ${enabled ? "on" : "off"} exited ${result.exitCode}.`,
  );
}

/** Where the server is, and whether it answers at all. */
export type TorrServerHealth = {
  url: string;
  reachable: boolean;
};

/**
 * `doris --json health` says `"torrserver": "<url>"` when it answers and
 * `"unreachable at <url>"` when it does not. Both carry the URL, so the Web UI
 * action still knows where to point when the server is down.
 */
export function parseTorrServerHealth(text: string): TorrServerHealth | null {
  const payload = readJson(text);
  if (!isRecord(payload) || typeof payload.torrserver !== "string") return null;
  const unreachable = /^unreachable at (.+)$/i.exec(payload.torrserver.trim());
  if (unreachable?.[1]) return { url: unreachable[1].trim(), reachable: false };
  return { url: payload.torrserver.trim(), reachable: true };
}

export async function torrServerHealth(bin: string): Promise<TorrServerHealth> {
  const result = await run(bin, ["--json", "health"]);
  const health = parseTorrServerHealth(result.stdout);
  if (!health) {
    throw new Error(
      firstLine(result.stderr) ||
        `doris health exited ${result.exitCode} without an answer.`,
    );
  }
  return health;
}

/** Where the server puts what it fetches, and whether it keeps it. */
export type TorrServerStorage = {
  path: string;
  useDisk: boolean;
  /** `--keep-cache`: still there after the last reader leaves. */
  keepCache: boolean;
};

function storageAnswer(result: CommandResult): TorrServerStorage {
  const payload = readJson(result.stdout);
  if (isRecord(payload)) {
    return {
      path: typeof payload.path === "string" ? payload.path : "",
      useDisk: payload.use_disk === true,
      keepCache: payload.keep_cache === true,
    };
  }
  throw new Error(
    firstLine(result.stderr) ||
      `doris torrent storage exited ${result.exitCode} without an answer.`,
  );
}

export async function torrServerStorage(
  bin: string,
): Promise<TorrServerStorage> {
  return storageAnswer(await run(bin, ["--json", "torrent", "storage", "show"]));
}

/** `keep-cache` is a flag, so it is present or absent, never `false`. */
export function storageSetArgs(path: string, keepCache: boolean): string[] {
  return [
    "--json",
    "torrent",
    "storage",
    "set",
    path,
    ...(keepCache ? ["--keep-cache"] : []),
  ];
}

export function storageOffArgs(): string[] {
  return ["--json", "torrent", "storage", "off"];
}

/** Answers with the state that is now true, not with what was asked for. */
export async function setTorrServerStorage(
  bin: string,
  path: string,
  keepCache: boolean,
): Promise<TorrServerStorage> {
  return storageAnswer(await run(bin, storageSetArgs(path, keepCache)));
}

export async function turnOffTorrServerStorage(
  bin: string,
): Promise<TorrServerStorage> {
  return storageAnswer(await run(bin, storageOffArgs()));
}
