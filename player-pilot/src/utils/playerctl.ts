import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type PlayerStatus = "Playing" | "Paused" | "Stopped";

export type PlayerMetadata = {
  title?: string;
  artist?: string;
  album?: string;
  albumArt?: string;
  /** seconds */
  length?: number;
  /** seconds */
  position?: number;
};

export type PlayerInfo = {
  /** the MPRIS bus name, e.g. `firefox.instance_1_45` */
  name: string;
  /** the family, e.g. `Firefox` */
  displayName: string;
  status: PlayerStatus;
  metadata: PlayerMetadata | null;
};

export type PlayerCtlPlaybackAction = "play" | "pause" | "stop" | "next" | "previous";

const STATUS_ORDER: Record<PlayerStatus, number> = { Playing: 0, Paused: 1, Stopped: 2 };

/**
 * A control character, not a printable one: no MPRIS tag carries it, so a title
 * that happens to contain the separator cannot split a column.
 */
const SEP = "\u001f";

/** Field order of `parseMetadata`. */
const FIELDS = ["title", "artist", "album", "mpris:artUrl", "mpris:length", "position"];

async function playerctl(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("playerctl", args, { timeout: 5000 });
  return stdout;
}

/** playerctl exits non-zero with this on stderr when no player is running. */
function isNoPlayers(error: unknown): boolean {
  return (error as { stderr?: string }).stderr?.includes("No players found") ?? false;
}

/**
 * `playerctl metadata --format` answers one line, so the padded column layout of
 * plain `metadata` (which cannot be split on spaces: titles contain them) is not
 * needed and neither is a second `status` call.
 */
export function parseMetadata(raw: string): PlayerMetadata | null {
  const parts = raw.replace(/\n$/, "").split(SEP);
  const at = (index: number) => parts[index]?.trim() || undefined;

  const metadata: PlayerMetadata = {
    title: at(0),
    artist: at(1),
    album: at(2),
    albumArt: at(3),
  };

  // playerctl reports length in microseconds and position in seconds.
  const length = Number(at(4));
  if (Number.isFinite(length) && length > 0) metadata.length = Math.round(length / 1_000_000);
  const position = Number(at(5));
  if (Number.isFinite(position) && position >= 0) metadata.position = Math.round(position);

  return Object.values(metadata).some((value) => value !== undefined) ? metadata : null;
}

/** `firefox.instance_1_45` and `firefox` are the same player family. */
export function playerFamily(name: string): string {
  return name.split(".")[0]!.toLowerCase();
}

/**
 * The preference names families, so `spotify` matches `spotify.instance_7` and
 * `spot` matches nothing — upstream's two-way `includes` matched both `spotify`
 * and any player whose name merely contains `spot`.
 */
export function filterPlayers(names: string[], preferred: string[] | undefined): string[] {
  if (preferred === undefined) return names;

  const wanted = preferred.map((name) => name.trim().toLowerCase()).filter(Boolean);
  return names.filter((name) => {
    return wanted.includes(playerFamily(name)) || wanted.includes(name.toLowerCase());
  });
}

/** `firefox.instance_1_45` reads as `Firefox`; the bus suffix is machine noise. */export function displayName(name: string): string {
  const family = playerFamily(name);
  return family.charAt(0).toUpperCase() + family.slice(1);
}

/** `0:07`, or `1:02:03` once the stream passes an hour. */
export function formatTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = String(whole % 60).padStart(2, "0");
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}`
    : `${minutes}:${rest}`;
}

/**
 * The track is the useful line on a card; artist and album fill in when a stream
 * carries no title. An empty tag reads as absent — measured: `xesam:album` comes
 * back as an empty string, which is what produced upstream's `Денис Селезнёв - `.
 */
export function playerSubtitle(player: PlayerInfo): string {
  const metadata = player.metadata;
  if (metadata?.title) return metadata.title;
  if (metadata?.artist && metadata.album) return `${metadata.artist} – ${metadata.album}`;
  return metadata?.artist ?? player.status;
}

export async function getPlayerMetadata(player: string): Promise<PlayerMetadata | null> {
  try {
    const format = FIELDS.map((field) => `{{${field}}}`).join(SEP);
    return parseMetadata(await playerctl(["--player", player, "metadata", "--format", format]));
  } catch (error) {
    if (isNoPlayers(error)) return null;
    throw error;
  }
}

export async function getAllPlayers(preferredPlayerNames?: string[]): Promise<PlayerInfo[]> {
  let names: string[];
  try {
    names = (await playerctl(["--list-all"]))
      .split("\n")
      .map((name) => name.trim())
      .filter((name) => name.length > 0);
  } catch (error) {
    if (isNoPlayers(error)) return [];
    throw error;
  }

  const players: PlayerInfo[] = [];
  for (const name of filterPlayers(names, preferredPlayerNames)) {
    try {
      const status = (await playerctl(["--player", name, "status"])).trim() as PlayerStatus;
      const metadata =
        status === "Playing" || status === "Paused" ? await getPlayerMetadata(name) : null;
      players.push({ name, displayName: displayName(name), status, metadata });
    } catch (error) {
      // A player that vanished between `--list-all` and this call is not an error.
      console.warn(`playerctl failed for ${name}:`, error);
    }
  }

  return players.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
}

export async function executePlaybackAction(
  action: PlayerCtlPlaybackAction,
  playerName?: string,
): Promise<void> {
  const target = playerName === undefined ? ["--all-players"] : ["--player", playerName];
  try {
    await playerctl([...target, action]);
  } catch (error) {
    // The preferred player simply is not running; nothing to report.
    if (isNoPlayers(error)) return;
    throw error;
  }
}
