import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, readlinkSync, statSync } from "node:fs";
import { cpus } from "node:os";
import { basename } from "node:path";

/**
 * The process table, read the way btop reads it: everything comes from `/proc`,
 * nothing from `ps` and nothing from a dependency.
 *
 * The two numbers that differ between machines — the page size and the clock
 * tick rate — are the only things asked of `getconf`, once, at the first
 * sample; Node has no call for either.
 */

/** One row: what btop's Program, Command, CPU and MEM columns carry. */
export type ProcessInfo = {
  pid: number;
  ppid: number;
  /** `/proc/<pid>/comm`: the kernel's short name, what btop's Program column holds. */
  name: string;
  /** `/proc/<pid>/cmdline`: the full argv, what btop's Command column holds. */
  command: string;
  /** `/proc/<pid>/exe`, empty for kernel threads and for other users' processes. */
  path: string;
  /** Owner from the uid on the `/proc/<pid>` directory, resolved through `/etc/passwd`. */
  user: string;
  /** The state letter spelled out: Running, Sleeping, Zombie. */
  state: string;
  /** Percent of one core, from the delta since the previous sample. */
  cpu: number;
  memBytes: number;
  threads: number;
  nice: number;
  /** Epoch milliseconds, from the boot time plus `starttime`. */
  startedAt: number;
  elapsed: number;
};

/** What the next sample needs from the last one to turn ticks into a rate. */
export type CpuSample = {
  /** Total jiffies over every core, from the first `cpu` line of `/proc/stat`. */
  jiffies: number;
  /** Per-pid utime + stime. */
  ticks: Map<number, number>;
};

export type Snapshot = {
  processes: ProcessInfo[];
  sample: CpuSample;
};

export type SortBy = "cpu" | "memory";

const PAGE_SIZE_FALLBACK = 4096;
const CLOCK_TICKS_FALLBACK = 100;

let platform: { pageSize: number; clockTicks: number } | null = null;

function platformConstants(): { pageSize: number; clockTicks: number } {
  if (platform !== null) return platform;
  const ask = (name: string, fallback: number): number => {
    try {
      const answer = Number(execFileSync("getconf", [name], { encoding: "utf8" }).trim());
      return Number.isFinite(answer) && answer > 0 ? answer : fallback;
    } catch {
      return fallback;
    }
  };
  platform = {
    pageSize: ask("PAGESIZE", PAGE_SIZE_FALLBACK),
    clockTicks: ask("CLK_TCK", CLOCK_TICKS_FALLBACK),
  };
  return platform;
}

export type StatFields = {
  pid: number;
  name: string;
  state: string;
  ppid: number;
  /** utime + stime, in clock ticks. */
  ticks: number;
  nice: number;
  threads: number;
  starttime: number;
  rssPages: number;
};

/**
 * `/proc/<pid>/stat` wraps the program name in parentheses and does not escape
 * it, so the name may itself contain spaces and parentheses — `(Web Content
 * (tab 2))` is a real name. The numbered fields therefore start after the
 * *last* `)` on the line, not the first.
 */
export function parseStat(text: string): StatFields | null {
  const open = text.indexOf("(");
  const close = text.lastIndexOf(")");
  if (open < 0 || close < open) return null;

  const pid = Number(text.slice(0, open).trim());
  const fields = text.slice(close + 1).trim().split(/\s+/);
  // fields[0] is field 3 of the file, the state letter right after the name.
  const field = (number: number): number => {
    const value = fields[number - 3];
    return value === undefined ? NaN : Number(value);
  };

  const utime = field(14);
  const stime = field(15);
  const values = {
    state: fields[0] ?? "",
    ppid: field(4),
    nice: field(19),
    threads: field(20),
    starttime: field(22),
    rssPages: field(24),
  };
  if (
    !Number.isFinite(pid) ||
    values.state === "" ||
    [values.ppid, utime, stime, values.nice, values.threads, values.starttime, values.rssPages].some(
      (value) => !Number.isFinite(value),
    )
  ) {
    return null;
  }

  return {
    pid,
    name: text.slice(open + 1, close),
    ...values,
    ticks: utime + stime,
  };
}

/**
 * The first `cpu` line of `/proc/stat` sums every core's time in jiffies, and
 * `btime` is the boot time in epoch seconds. btop sums the first eight fields
 * of that line, which is every counter up to `guest`.
 */
export function parseCpuTotals(statText: string): { jiffies: number; bootTime: number } {
  let jiffies = 0;
  let bootTime = 0;
  for (const line of statText.split("\n")) {
    if (line.startsWith("cpu ")) {
      jiffies = line
        .trim()
        .split(/\s+/)
        .slice(1, 9)
        .reduce((sum, value) => sum + Number(value), 0);
    } else if (line.startsWith("btime ")) {
      bootTime = Number(line.split(/\s+/)[1]);
    }
  }
  return { jiffies, bootTime };
}

/**
 * btop's formula: the share of the machine's total time this delta took, times
 * the core count so that one saturated core reads 100%. The clamp keeps a
 * rounding artefact from reporting more than every core.
 */
export function cpuPercent(deltaTicks: number, deltaJiffies: number, cores: number): number {
  if (deltaJiffies <= 0 || deltaTicks <= 0) return 0;
  return Math.min((100 * deltaTicks) / deltaJiffies * cores, 100 * cores);
}

/** `/proc/<pid>/cmdline` is argv with NUL separators and a trailing NUL. */
export function parseCommand(cmdline: string, fallback: string): string {
  const command = cmdline.split("\0").join(" ").trim();
  return command === "" ? `[${fallback}]` : command;
}

export function parseIo(text: string): { read: number; write: number } {
  const field = (name: string): number => {
    const match = new RegExp(`^${name}: (\\d+)$`, "m").exec(text);
    return match?.[1] === undefined ? 0 : Number(match[1]);
  };
  return { read: field("read_bytes"), write: field("write_bytes") };
}

/** `/etc/passwd` as uid → name; the first entry for a uid wins, as in libc. */
export function parsePasswd(text: string): Map<number, string> {
  const users = new Map<number, string>();
  for (const line of text.split("\n")) {
    const [name, , uid] = line.split(":");
    if (name === undefined || name === "" || uid === undefined) continue;
    const id = Number(uid);
    if (Number.isFinite(id) && !users.has(id)) users.set(id, name);
  }
  return users;
}

/** btop's own table, with `I` added: btop has no idle and calls it Unknown. */
const STATES: Record<string, string> = {
  R: "Running",
  S: "Sleeping",
  D: "Waiting",
  I: "Idle",
  Z: "Zombie",
  T: "Stopped",
  t: "Tracing",
  X: "Dead",
  x: "Dead",
  K: "Wakekill",
  W: "Waking",
  P: "Parked",
};

export function stateWord(state: string): string {
  return STATES[state] ?? "Unknown";
}

let users: Map<number, string> | null = null;

function userNames(): Map<number, string> {
  if (users === null) {
    try {
      users = parsePasswd(readFileSync("/etc/passwd", "utf8"));
    } catch {
      users = new Map();
    }
  }
  return users;
}

let coreCount: number | null = null;

function cores(): number {
  if (coreCount === null) coreCount = cpus().length || 1;
  return coreCount;
}

/**
 * One read of the whole table. The first call has no predecessor, so every
 * CPU share is 0 until a second one arrives — call it twice a moment apart on
 * open to avoid a screen of zeros.
 */
export function collect(previous: CpuSample | null = null): Snapshot {
  const { pageSize, clockTicks } = platformConstants();
  const { jiffies, bootTime } = parseCpuTotals(readFileSync("/proc/stat", "utf8"));
  const deltaJiffies = previous === null ? 0 : jiffies - previous.jiffies;
  const names = userNames();
  const ticks = new Map<number, number>();
  const processes: ProcessInfo[] = [];
  const now = Date.now();

  for (const entry of readdirSync("/proc")) {
    if (!/^\d+$/.test(entry)) continue;
    const pid = Number(entry);
    const dir = `/proc/${entry}`;

    let stat: string;
    try {
      stat = readFileSync(`${dir}/stat`, "utf8");
    } catch {
      // It exited between the directory read and this one.
      continue;
    }
    const fields = parseStat(stat);
    if (fields === null) continue;
    ticks.set(pid, fields.ticks);

    const before = previous?.ticks.get(pid);
    const cpu =
      before === undefined ? 0 : cpuPercent(fields.ticks - before, deltaJiffies, cores());

    let command = fields.name;
    try {
      command = parseCommand(readFileSync(`${dir}/cmdline`, "utf8"), fields.name);
    } catch {
      // A zombie keeps its directory but has nothing to read.
    }

    let path = "";
    try {
      path = readlinkSync(`${dir}/exe`);
    } catch {
      // Kernel threads have none; another user's process is not ours to read.
    }

    let user = "";
    try {
      const uid = statSync(dir).uid;
      user = names.get(uid) ?? String(uid);
    } catch {
      // Gone already; the row is still worth showing.
    }

    const startedAt = (bootTime + fields.starttime / clockTicks) * 1000;

    processes.push({
      pid,
      ppid: fields.ppid,
      name: fields.name,
      command,
      path,
      user,
      state: stateWord(fields.state),
      cpu,
      memBytes: fields.rssPages * pageSize,
      threads: fields.threads,
      nice: fields.nice,
      startedAt,
      elapsed: Math.max(0, (now - startedAt) / 1000),
    });
  }

  return { processes, sample: { jiffies, ticks } };
}

/**
 * CPU descending, which is btop's `cpu lazy` default: a row that used nothing
 * still sorts above nothing by the memory it holds, and the order stops
 * shuffling between two idle samples.
 */
export function order(processes: ProcessInfo[], by: SortBy): ProcessInfo[] {
  return [...processes].sort((a, b) => {
    if (by === "memory") return b.memBytes - a.memBytes || b.cpu - a.cpu || a.pid - b.pid;
    return b.cpu - a.cpu || b.memBytes - a.memBytes || a.pid - b.pid;
  });
}

/**
 * Find what a caller meant by a name: the kernel's short name, or the
 * executable's own file name, both matched exactly.
 *
 * Not a substring of anything: `pgrep -f` matched any process whose argument
 * list merely mentioned the word — the shell that ran it included — and
 * killing an editor because it has `firefox` in a file name is not a fix.
 */
export function matchProcesses(processes: ProcessInfo[], wanted: string): ProcessInfo[] {
  const lower = wanted.trim().toLowerCase();
  if (lower === "") return [];
  return processes.filter(
    (row) =>
      row.name.toLowerCase() === lower ||
      (row.path !== "" && basename(row.path).toLowerCase() === lower),
  );
}

/** `/proc/<pid>/comm`, empty if it is gone. */
export function nameOf(pid: number): string {
  try {
    return readFileSync(`/proc/${pid}/comm`, "utf8").trim();
  } catch {
    return "";
  }
}

/** Bytes read and written, or null when this user may not read them. */
export function readIo(pid: number): { read: number; write: number } | null {
  try {
    return parseIo(readFileSync(`/proc/${pid}/io`, "utf8"));
  } catch {
    return null;
  }
}

/** btop's row keeps two decimals below ten, one below a hundred, none above. */
export function percent(cpu: number): string {
  const decimals = cpu < 9.995 ? 2 : cpu < 99.95 ? 1 : 0;
  return `${cpu.toFixed(decimals)}%`;
}

/** Binary units, as btop's default (`base_10_sizes` off) spells them. */
export function humanBytes(bytes: number): string {
  const units = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const decimals = unit === 0 ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${Number(value.toFixed(decimals))} ${units[unit]}`;
}

/** `2d 03:04:05`, the shape of btop's `sec_to_dhms`. */
export function humanElapsed(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const days = Math.floor(total / 86400);
  const rest = total % 86400;
  const pad = (value: number): string => String(value).padStart(2, "0");
  const clock = `${pad(Math.floor(rest / 3600))}:${pad(Math.floor((rest % 3600) / 60))}:${pad(rest % 60)}`;
  return days > 0 ? `${days}d ${clock}` : clock;
}
