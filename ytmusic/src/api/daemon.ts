import { spawn } from "node:child_process";
import { connect } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";

import { loadAuth } from "~/api/auth";
import type { PlayerState, RepeatMode, ControlAction } from "~/api/mpv";
import { VOLUME_STEP, nextRepeat } from "~/api/mpv";
import type { MusicConfig } from "~/api/player";
import { musicTrackUrl, type MusicTrack } from "~/utils/ytmusic";

/**
 * The launcher as a client of `ytmusicd`: the queue, the position and the volume live in the
 * daemon, so a terminal client sees and controls the same playback. Each launcher run is short
 * lived, so every call opens a connection, says `hello`, sends its commands and leaves —
 * nothing here keeps a socket or a timer alive.
 */
const PROTOCOL = 1;

/** The same path `ytmusicd` and `ytmusicctl` compute; a client that looked elsewhere would start a second daemon. */
export function daemonSocket(env: NodeJS.ProcessEnv = process.env, home: string | null = homedir()): string {
  const base = env.XDG_RUNTIME_DIR ? env.XDG_RUNTIME_DIR : home ? join(home, ".cache") : "/tmp";
  return join(base, "ytmusic", "ytmusicd.sock");
}

type Command = { cmd: string; args?: Record<string, unknown> };

type Reply = { id: number; ok: boolean; data?: unknown; error?: { code: string; message: string } };

/** The daemon's refusal, with the code a caller can branch on. */
export class DaemonError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Sends `commands` on one connection and returns their answers in order. The first refusal
 * rejects the whole batch. `hello` is id 1; the commands are 2…
 */
export function exchange(socket: string, commands: Command[], timeoutMs = 3_000): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const client = connect(socket);
    const replies = new Map<number, Reply>();
    let buffer = "";
    let done = false;

    const finish = (error?: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      client.destroy();
      if (error) reject(error);
      else resolve(commands.map((_, index) => replies.get(index + 2)?.data));
    };

    const timer = setTimeout(() => finish(new Error("ytmusicd did not answer")), timeoutMs);

    client.on("connect", () => {
      const lines = [{ id: 1, cmd: "hello", args: { protocol: PROTOCOL, client: "vicinae-ytmusic" } }].concat(
        commands.map((command, index) => ({ id: index + 2, ...command }) as never),
      );
      client.write(lines.map((line) => `${JSON.stringify(line)}\n`).join(""));
    });

    client.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      for (let newline = buffer.indexOf("\n"); newline >= 0; newline = buffer.indexOf("\n")) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        let reply: Reply;
        try {
          reply = JSON.parse(line) as Reply;
        } catch {
          continue;
        }
        if (typeof reply.id !== "number") continue;
        if (!reply.ok) {
          finish(new DaemonError(reply.error?.code ?? "internal", reply.error?.message ?? "ytmusicd refused the request"));
          return;
        }
        replies.set(reply.id, reply);
        if (replies.size === commands.length + 1) finish();
      }
    });

    client.on("error", (error) => finish(error));
    client.on("close", () => finish(new Error("ytmusicd closed the connection")));
  });
}

function reachable(socket: string): Promise<boolean> {
  return new Promise((resolve) => {
    const client = connect(socket);
    client.once("connect", () => {
      client.destroy();
      resolve(true);
    });
    client.once("error", () => resolve(false));
  });
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

/** Environment for a daemon the launcher starts: the cookies, as the CLI bridge passes them. */
export function daemonEnv(config: MusicConfig, env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const { auth } = loadAuth(config.auth);
  if (!auth) return env;
  return { ...env, YTMUSIC_COOKIES: auth.cookies, YTMUSIC_AUTHUSER: String(auth.authUser) };
}

/** Finds the daemon, or starts it detached and waits until it answers. */
async function ensureDaemon(config: MusicConfig): Promise<string> {
  const socket = daemonSocket();
  if (await reachable(socket)) return socket;

  await new Promise<void>((resolve, reject) => {
    const child = spawn(config.daemon, config.window ? ["--window"] : [], {
      detached: true,
      stdio: "ignore",
      env: daemonEnv(config),
    });
    child.once("error", (error: NodeJS.ErrnoException) =>
      reject(
        new Error(
          error.code === "ENOENT"
            ? `Cannot start ${config.daemon}: not found. Install ytmusicd from the ytmusic-rs repository or set Daemon Command.`
            : `Cannot start ${config.daemon}: ${error.message}`,
        ),
      ),
    );
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });

  // The socket appears a few milliseconds after the process starts; a launcher run may wait.
  for (let attempt = 0; attempt < 40; attempt++) {
    if (await reachable(socket)) return socket;
    await sleep(75);
  }
  throw new Error("ytmusicd started but did not open its socket");
}

// --- playback ---------------------------------------------------------------------------

/** Replaces the queue and plays from the first track. */
export async function playTracks(tracks: MusicTrack[], config: MusicConfig): Promise<void> {
  const playable = tracks.filter((track) => track.videoId);
  if (playable.length === 0) return;
  const socket = await ensureDaemon(config);
  await exchange(socket, [{ cmd: "play", args: { tracks: playable } }]);
}

/** `next` puts the track after the current one, otherwise at the end of the queue. */
export async function queueTrack(track: MusicTrack, config: MusicConfig, next: boolean): Promise<void> {
  if (!track.videoId) return;
  const socket = await ensureDaemon(config);
  await exchange(socket, [{ cmd: "queue.add", args: { tracks: [track], next } }]);
}

type WireState = {
  status: "stopped" | "loading" | "playing" | "paused";
  entry?: number;
  clock: { position_ms: number; at_ms: number; rate: number };
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
};
type WireEntry = { entry: number; track: MusicTrack };

/** What the Now Playing view and the sidebar preview read, built from `state` and `queue.get`. */
export function toPlayerState(state: WireState, queue: { entries: WireEntry[] }, now: number = Date.now()): PlayerState | null {
  if (state.status === "stopped" && state.entry === undefined) return null;

  const entries = queue.entries;
  const at = entries.findIndex((entry) => entry.entry === state.entry);
  const current = at >= 0 ? entries[at]?.track : undefined;
  const position = Math.max(0, state.clock.position_ms + (now - state.clock.at_ms) * state.clock.rate) / 1000;

  return {
    title: current?.title,
    path: current?.videoId ? musicTrackUrl(current.videoId) : undefined,
    paused: state.status === "paused",
    position: current ? Math.min(position, current.duration ?? position) : undefined,
    duration: current?.duration,
    index: at >= 0 ? at + 1 : 0,
    count: entries.length,
    queue: entries.flatMap((entry) => (entry.track.videoId ? [musicTrackUrl(entry.track.videoId)] : [])),
    volume: state.volume,
    muted: state.muted,
    shuffle: state.shuffle,
    repeat: state.repeat,
  };
}

/** Null when no daemon runs or nothing is loaded; asking never starts one. */
export async function playerState(_config: MusicConfig): Promise<PlayerState | null> {
  const socket = daemonSocket();
  if (!(await reachable(socket))) return null;
  const [state, queue] = (await exchange(socket, [{ cmd: "state" }, { cmd: "queue.get" }])) as [WireState, { entries: WireEntry[] }];
  return toPlayerState(state, queue);
}

async function running(): Promise<string | null> {
  const socket = daemonSocket();
  return (await reachable(socket)) ? socket : null;
}

/** Switches to the queue row at `index` (0-based, the order `playerState().queue` lists). */
export async function jump(_config: MusicConfig, index: number): Promise<void> {
  const socket = await running();
  if (!socket) return;
  const [queue] = (await exchange(socket, [{ cmd: "queue.get" }])) as [{ entries: WireEntry[] }];
  const entry = queue.entries[index];
  if (!entry) return;
  await exchange(socket, [{ cmd: "queue.jump", args: { entry: entry.entry } }]);
}

async function volumeNow(socket: string, command: Command): Promise<number> {
  const [, state] = (await exchange(socket, [command, { cmd: "state" }])) as [unknown, WireState];
  return state.volume;
}

export async function setVolume(_config: MusicConfig, percent: number): Promise<number | null> {
  const socket = await running();
  if (!socket) return null;
  return volumeNow(socket, { cmd: "volume", args: { set: Math.min(100, Math.max(0, Math.round(percent))) } });
}

export async function adjustVolume(_config: MusicConfig, delta: number): Promise<number | null> {
  const socket = await running();
  if (!socket) return null;
  return volumeNow(socket, { cmd: "volume", args: { by: Math.round(delta) } });
}

export async function toggleMute(_config: MusicConfig): Promise<boolean | null> {
  const socket = await running();
  if (!socket) return null;
  const [, state] = (await exchange(socket, [{ cmd: "mute", args: {} }, { cmd: "state" }])) as [unknown, WireState];
  return state.muted;
}

export async function control(config: MusicConfig, action: ControlAction): Promise<void> {
  const socket = await running();
  if (!socket) return;

  switch (action) {
    case "toggle":
    case "next":
    case "stop":
      await exchange(socket, [{ cmd: action }]);
      return;
    case "previous":
      await exchange(socket, [{ cmd: "prev" }]);
      return;
    case "quit":
      await exchange(socket, [{ cmd: "shutdown" }]);
      return;
    case "volumeUp":
      await adjustVolume(config, VOLUME_STEP);
      return;
    case "volumeDown":
      await adjustVolume(config, -VOLUME_STEP);
      return;
    case "mute":
      await toggleMute(config);
      return;
    case "shuffle": {
      const [state] = (await exchange(socket, [{ cmd: "state" }])) as [WireState];
      await exchange(socket, [{ cmd: "shuffle", args: { on: !state.shuffle } }]);
      return;
    }
    case "repeat": {
      const [state] = (await exchange(socket, [{ cmd: "state" }])) as [WireState];
      await exchange(socket, [{ cmd: "repeat", args: { mode: nextRepeat(state.repeat) } }]);
      return;
    }
  }
}
