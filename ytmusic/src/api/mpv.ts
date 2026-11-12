import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { MusicConfig } from "~/api/player";

/** One mpv per user, shared by every launcher run, controlled over its JSON IPC socket. */
export const SOCKET_NAME = "vicinae-ytmusic.sock";

export function socketPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(env.XDG_RUNTIME_DIR || tmpdir(), SOCKET_NAME);
}

export function mpvArgs(socket: string, config: MusicConfig): string[] {
  return [
    "--idle=yes",
    config.window ? "--force-window=yes" : "--force-window=no",
    ...(config.window ? [] : ["--no-video"]),
    "--no-terminal",
    `--input-ipc-server=${socket}`,
    ...config.playerArgs,
  ];
}

/** mpv's "Play files in random order", or "Play all" / "Repeat one". */
export type RepeatMode = "off" | "all" | "one";

export type PlayerState = {
  title?: string;
  /** The URL mpv was given: the cover is derived from the video id in it. */
  path?: string;
  paused: boolean;
  position?: number;
  duration?: number;
  /** 1-based position in `queue`, or 0 when mpv reports none. */
  index: number;
  count: number;
  /** The playlist in playback order: each entry is the URL mpv was given. */
  queue: string[];
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
};

type Command = Array<string | number | boolean>;

/**
 * Sends commands over one connection and resolves with their replies, in order. A property mpv
 * has no value for (`time-pos` before the first frame) is `undefined` when `tolerant`; otherwise
 * the first refusal rejects the whole batch.
 */
function request(socket: string, commands: Command[], tolerant = false): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const client = connect(socket);
    const replies = new Map<number, unknown>();
    let buffer = "";
    let done = false;

    const finish = (error?: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      client.destroy();
      if (error) reject(error);
      else resolve(commands.map((_, index) => replies.get(index + 1)));
    };

    const timer = setTimeout(() => finish(new Error("mpv did not answer")), 2_000);

    client.on("connect", () => {
      for (const [index, command] of commands.entries()) {
        client.write(`${JSON.stringify({ command, request_id: index + 1 })}\n`);
      }
    });
    client.on("error", (error) => finish(error));
    client.on("data", (chunk) => {
      buffer += chunk.toString();
      for (let newline = buffer.indexOf("\n"); newline >= 0; newline = buffer.indexOf("\n")) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        let message: { error?: string; data?: unknown; request_id?: number };
        try {
          message = JSON.parse(line) as typeof message;
        } catch {
          continue;
        }
        if (typeof message.request_id !== "number") continue;
        if (message.error !== "success") {
          if (!tolerant) {
            finish(new Error(message.error ?? "mpv refused the command"));
            return;
          }
          replies.set(message.request_id, undefined);
        } else {
          replies.set(message.request_id, message.data);
        }
        if (replies.size === commands.length) finish();
      }
    });
  });
}

function start(config: MusicConfig): Promise<void> {
  const socket = socketPath();
  return new Promise((resolve, reject) => {
    const child = spawn("mpv", mpvArgs(socket, config), { detached: true, stdio: "ignore" });
    child.once("error", (error) => reject(error));
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

function connected(socket: string): Promise<boolean> {
  return request(socket, [["get_property", "idle-active"]]).then(
    () => true,
    () => false,
  );
}

/** Starts mpv when it is not there, and replaces one running in the other headless/window mode. */
async function ensureServer(config: MusicConfig): Promise<string> {
  const socket = socketPath();
  if (await connected(socket)) {
    const current = await request(
      socket,
      [["get_property", "options/force-window"]],
      true,
    ).catch(() => []);
    // an mpv that cannot report the option is left alone rather than restarted on every play
    if (current[0] === undefined || current[0] === config.window) return socket;

    await request(socket, [["quit"]], true).catch(() => []);
    for (let attempt = 0; attempt < 40 && (await connected(socket)); attempt++) {
      await new Promise((done) => setTimeout(done, 50));
    }
  }

  rmSync(socket, { force: true });
  try {
    await start(config);
  } catch (error) {
    throw new Error(
      `cannot start mpv: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  for (let attempt = 0; attempt < 40; attempt++) {
    if (await connected(socket)) return socket;
    await new Promise((done) => setTimeout(done, 50));
  }

  throw new Error("mpv started but its control socket never answered");
}

/** Replaces the queue with `url`: a video, or a playlist mpv resolves through yt-dlp. */
export async function playUrl(url: string, config: MusicConfig): Promise<void> {
  const socket = await ensureServer(config);
  await request(socket, [["loadfile", url, "replace"]]);
}

/**
 * Plays tracks one by one over the same connection. A signed-in playlist cannot be handed to
 * mpv as a URL: yt-dlp does not get the session's cookies, but the song ids are public.
 */
export async function playQueue(urls: string[], config: MusicConfig): Promise<void> {
  const [first, ...rest] = urls;
  if (first === undefined) return;

  const socket = await ensureServer(config);
  await request(socket, [
    ["loadfile", first, "replace"],
    ...rest.map((url): Command => ["loadfile", url, "append"]),
  ]);
}

/** `next` puts the url after the current track, otherwise at the end of the queue. */
export async function queueUrl(url: string, config: MusicConfig, next: boolean): Promise<void> {
  const socket = await ensureServer(config);
  await request(socket, [["loadfile", url, next ? "append-play" : "append"]]);
}

/** The filenames of mpv's `playlist` property, in playback order. */
export function queueFilenames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const filename = (entry as { filename?: unknown }).filename;
    return typeof filename === "string" && filename !== "" ? [filename] : [];
  });
}

/** The player's state, or null when nothing is playing and mpv is not running. */
export async function playerState(config: MusicConfig): Promise<PlayerState | null> {
  const socket = socketPath();
  if (!(await connected(socket))) return null;

  const [
    title,
    path,
    paused,
    position,
    duration,
    index,
    count,
    queue,
    volume,
    muted,
    idle,
    shuffle,
    loopPlaylist,
    loopFile,
  ] = (await request(
    socket,
    [
      ["get_property", "media-title"],
      ["get_property", "path"],
      ["get_property", "pause"],
      ["get_property", "time-pos"],
      ["get_property", "duration"],
      ["get_property", "playlist-pos"],
      ["get_property", "playlist-count"],
      ["get_property", "playlist"],
      ["get_property", "volume"],
      ["get_property", "mute"],
      ["get_property", "idle-active"],
      ["get_property", "shuffle"],
      ["get_property", "loop-playlist"],
      ["get_property", "loop-file"],
    ],
    // an idle mpv has no title, path, position or duration: each answers "property unavailable"
    true,
  )) as [
    string?,
    string?,
    boolean?,
    number?,
    number?,
    number?,
    number?,
    unknown?,
    number?,
    boolean?,
    boolean?,
    boolean?,
    unknown?,
    unknown?,
  ];

  if (idle === true) return null;

  return {
    title: typeof title === "string" && title !== "" ? title : undefined,
    path: typeof path === "string" && path !== "" ? path : undefined,
    paused: paused === true,
    position: typeof position === "number" ? position : undefined,
    duration: typeof duration === "number" ? duration : undefined,
    index: typeof index === "number" && index >= 0 ? index + 1 : 0,
    count: typeof count === "number" ? count : 0,
    queue: queueFilenames(queue),
    volume: typeof volume === "number" ? clampVolume(volume) : 100,
    muted: muted === true,
    shuffle: shuffle === true,
    repeat: repeatMode(loopPlaylist, loopFile),
  };
}

function loopActive(value: unknown): boolean {
  return value !== undefined && value !== null && value !== false && value !== "no" && value !== 0;
}

export function repeatMode(loopPlaylist: unknown, loopFile: unknown): RepeatMode {
  if (loopActive(loopFile)) return "one";
  return loopActive(loopPlaylist) ? "all" : "off";
}

/** Off → all → one → off: the cycle the Now Playing action walks. */
export function nextRepeat(mode: RepeatMode): RepeatMode {
  return mode === "off" ? "all" : mode === "all" ? "one" : "off";
}

/** Fisher–Yates, with an injectable source so a test can pin the order. */
export function shuffled<T>(items: T[], random: () => number = Math.random): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    const picked = copy[swap] as T;
    copy[swap] = copy[index] as T;
    copy[index] = picked;
  }
  return copy;
}

/** mpv's default ceiling; anything above is amplified and clipped. */
export const VOLUME_MAX = 130;
export const VOLUME_STEP = 5;

export function clampVolume(value: number): number {
  return Math.min(VOLUME_MAX, Math.max(0, Math.round(value)));
}

async function changeVolume(config: MusicConfig, next: (current: number) => number): Promise<number | null> {
  const socket = socketPath();
  if (!(await connected(socket))) return null;

  const [volume] = (await request(socket, [["get_property", "volume"]], true)) as [number?];
  const value = clampVolume(next(typeof volume === "number" ? volume : 100));
  await request(socket, [["set_property", "volume", value]]);
  return value;
}

/** A relative step, the +5%/-5% pair the action panel shows. */
export function adjustVolume(config: MusicConfig, delta: number): Promise<number | null> {
  return changeVolume(config, (current) => current + delta);
}

export function setVolume(config: MusicConfig, percent: number): Promise<number | null> {
  return changeVolume(config, () => percent);
}

export async function toggleMute(config: MusicConfig): Promise<boolean | null> {
  const socket = socketPath();
  if (!(await connected(socket))) return null;

  const [muted] = (await request(socket, [["get_property", "mute"]], true)) as [boolean?];
  const next = muted !== true;
  await request(socket, [["set_property", "mute", next]]);
  return next;
}

/** Switches playback to the queue entry at `index` (0-based), resuming a paused queue. */
export async function jump(config: MusicConfig, index: number): Promise<void> {
  const socket = socketPath();
  if (!(await connected(socket))) return;

  await request(socket, [
    ["set_property", "playlist-pos", index],
    ["set_property", "pause", false],
  ]);
}

export type ControlAction =
  | "toggle"
  | "next"
  | "previous"
  | "stop"
  | "quit"
  | "shuffle"
  | "repeat"
  | "volumeUp"
  | "volumeDown"
  | "mute";

export async function control(config: MusicConfig, action: ControlAction): Promise<void> {
  const socket = socketPath();
  if (!(await connected(socket))) return;

  if (action === "volumeUp" || action === "volumeDown") {
    await adjustVolume(config, action === "volumeUp" ? VOLUME_STEP : -VOLUME_STEP);
    return;
  }

  if (action === "mute") {
    await toggleMute(config);
    return;
  }

  if (action === "repeat") {
    const [playlist, file] = (await request(
      socket,
      [
        ["get_property", "loop-playlist"],
        ["get_property", "loop-file"],
      ],
      true,
    )) as [unknown, unknown];
    const next = nextRepeat(repeatMode(playlist, file));

    await request(socket, [
      ["set_property", "loop-playlist", next === "all" ? "inf" : "no"],
      ["set_property", "loop-file", next === "one" ? "inf" : "no"],
    ]);
    return;
  }

  if (action === "shuffle") {
    const [shuffle] = (await request(
      socket,
      [["get_property", "shuffle"]],
      true,
    )) as [unknown];
    await request(socket, [["set_property", "shuffle", shuffle !== true]]);
    return;
  }

  const command: Command =
    action === "toggle"
      ? ["cycle", "pause"]
      : action === "next"
        ? ["playlist-next"]
        : action === "previous"
          ? ["playlist-prev"]
          : action === "quit"
            ? ["quit"]
            : ["stop"];
  await request(socket, [command]);
}
