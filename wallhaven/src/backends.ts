/**
 * Wallpaper backends: how to recognise the one that is running, and how to hand it a
 * file. Everything in this module is pure — the process list comes in, a backend comes
 * out — so `test/backends.test.ts` can check the table without a compositor.
 *
 * Why detect at all, when `@vicinae/api` has `Wallpaper.set`:
 *
 *   - Vicinae's server knows seven backends (cinnamon, gnome, hyprpaper, kde, macos,
 *     mate, swww/awww) — see `src/server/src/services/wallpaper/`. It shells out to the
 *     matching binary and nothing else.
 *   - On this machine none of those seven is installed, and Noctalia draws the wallpaper
 *     itself: no `swww`, `awww` or `hyprpaper` binary, and no such child process under
 *     the running `noctalia` (pid 1394). `Wallpaper.set` there fails with "neither awww
 *     nor swww is installed" — true, and beside the point.
 *   - Noctalia does expose the job, over its own CLI: `noctalia msg wallpaper-set <path>`
 *     and `noctalia msg wallpaper-get`, both measured working.
 *
 * So: detect, then call whichever backend is actually there. That also keeps the
 * extension honest on a machine that *does* run `swww` — Vicinae's own path, which is
 * better tested than ours.
 *
 * Detection is process-name based and nothing more. Sockets were considered and dropped:
 * `swww` publishes `$XDG_RUNTIME_DIR/swww/socket` and hyprpaper uses one too, but a stale
 * socket proves less than a live process and costs a filesystem probe on every apply.
 * One `ps` call answers it.
 */

export type BackendId =
  | "noctalia"
  | "swww"
  | "awww"
  | "hyprpaper"
  | "swaybg"
  | "mpvpaper"
  | "waypaper"
  | "skwd-wall";

/** One command to run. `detached` means "do not wait for it" — used when the backend is a daemon. */
export type Step = { argv: string[]; detached?: boolean };

export type Backend = {
  id: BackendId;
  /** Shown in the error when nothing can apply the wallpaper. */
  label: string;
  /** Process name to look for, as `ps -eo comm=` prints it. */
  process: string;
  /**
   * True when `@vicinae/api`'s `Wallpaper.set` already drives this backend. Prefer it: it
   * is the server's own code path, picks the binary, handles per-monitor layout and
   * reports what is missing. Only the backends Vicinae has never heard of need `apply`.
   */
  viaVicinae: boolean;
  /**
   * Steps to apply a local file. Absent means "recognised, but there is no way to drive it
   * from a shell" — `skwd-wall` is that: it is a selector with no documented set command,
   * so guessing one would be worse than saying so.
   */
  apply?: (path: string) => Step[];
};

/**
 * Order is priority order, first match wins, because more than one can be running — a
 * stale `swaybg` under a Noctalia shell is plausible, and Noctalia is the one drawing.
 *
 * `awww` is checked before `swww`: it is the same author's successor (`swww` was archived
 * in October 2025, `awww` is in Arch `extra` at 0.12.1) and both drive each other, so
 * preferring the live daemon over the archived one is the only difference that matters.
 */
export const BACKENDS: Backend[] = [
  {
    id: "noctalia",
    label: "Noctalia",
    process: "noctalia",
    viaVicinae: false,
    apply: (path) => [{ argv: ["noctalia", "msg", "wallpaper-set", path] }],
  },
  {
    id: "awww",
    label: "awww",
    process: "awww-daemon",
    viaVicinae: true,
  },
  {
    id: "swww",
    label: "swww",
    process: "swww",
    viaVicinae: true,
  },
  {
    id: "hyprpaper",
    label: "hyprpaper",
    process: "hyprpaper",
    viaVicinae: true,
  },
  {
    id: "swaybg",
    label: "swaybg",
    process: "swaybg",
    viaVicinae: false,
    // swaybg has no IPC: it draws once and never listens. Restarting the daemon is the
    // only way, which is why `stop` runs first. Detached, or the extension would hang on
    // a process that never exits.
    apply: (path) => [
      { argv: ["pkill", "-x", "swaybg"] },
      { argv: ["swaybg", "-i", path], detached: true },
    ],
  },
  {
    id: "mpvpaper",
    label: "mpvpaper",
    process: "mpvpaper",
    viaVicinae: false,
    // mpvpaper is for video; a still image will not play. Left as-is rather than guarded,
    // because whether it accepts a still is its business to report.
    apply: (path) => [{ argv: ["mpvpaper", path] }],
  },
  {
    id: "waypaper",
    label: "waypaper",
    process: "waypaper",
    viaVicinae: false,
    apply: (path) => [{ argv: ["waypaper", "--wallpaper", path] }],
  },
  {
    id: "skwd-wall",
    label: "Skwd Wall",
    // v2 is a Rust rewrite of the Skwd selector; the shell component it grew out of is
    // still around under the shorter name.
    process: "skwd-wall",
    viaVicinae: false,
  },
];

/** Extra names that mean the same backend. Checked after the table's own `process`. */
const ALIASES: Record<string, BackendId> = { skwd: "skwd-wall" };

export function findBackend(id: BackendId): Backend | undefined {
  return BACKENDS.find((b) => b.id === id);
}

/**
 * Resolve a backend from a `ps -eo comm=` dump.
 *
 * `names` is matched exactly, because `ps` prints the executable name: `skwd` must not
 * match a process called `skwd-editor`, and `swww` must not match `swww-daemon`.
 */
export function detectBackend(names: string[]): Backend | undefined {
  const running = new Set(names);
  for (const backend of BACKENDS) {
    if (running.has(backend.process)) return backend;
    const alias = Object.keys(ALIASES).find((a) => ALIASES[a] === backend.id);
    if (alias && running.has(alias)) return backend;
  }
  return undefined;
}

/**
 * The message for when there is nothing to apply with. Names the backends that were
 * recognised but cannot be driven, because "it is running, but not from a shell" is a
 * different problem from "nothing is running" and the fix is different.
 */
export function explainMissing(backend: Backend | undefined): string {
  const known = BACKENDS.filter((b) => b.viaVicinae).map((b) => b.process);
  if (backend && !backend.apply && !backend.viaVicinae) {
    return `${backend.label} is running but has no command to change the wallpaper from here. Set it in ${backend.label} itself, or pick a backend in preferences.`;
  }
  return `No wallpaper backend found. Nothing from ${known.slice(0, 4).join(", ")} is running. Start one, or set the wallpaper in your desktop settings.`;
}