import type { Torrent, TorrentFile } from "~/api/doris";

/** Same units and precision as doris's own `human_bytes`, so the two agree. */
export function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return unit === 0 ? `${Math.round(value)} B` : `${value.toFixed(1)} ${units[unit]}`;
}

export function formatSpeed(bytesPerSecond: number): string {
  return `${formatBytes(bytesPerSecond)}/s`;
}

export function progressPercent(loaded: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, (loaded / total) * 100));
}

/**
 * Measured on TorrServer MatriX.150: `pause` is `{"action":"drop"}` and the
 * row then reads "Torrent in db"; `resume` is `{"action":"get"}` and it reads
 * "Torrent working". A torrent that stopped on its own reads "in db" too, so
 * that string is shown as it is rather than renamed "paused", and only
 * "working" offers Pause.
 */
export function isRunning(status: string): boolean {
  return status.toLowerCase().includes("working");
}

function join(parts: (string | null | undefined | false)[]): string {
  return parts.filter((part): part is string => Boolean(part)).join(" · ");
}

export function torrentSubtitle(torrent: Torrent): string {
  const parts = [
    torrent.status || (torrent.loadedSize > 0 ? "partial" : "waiting"),
    `${progressPercent(torrent.loadedSize, torrent.totalSize).toFixed(1)}%`,
  ];
  if (torrent.downloadSpeed > 0) parts.push(`↓ ${formatSpeed(torrent.downloadSpeed)}`);
  if (torrent.uploadSpeed > 0) parts.push(`↑ ${formatSpeed(torrent.uploadSpeed)}`);
  parts.push(`${torrent.seeders} seeds`);
  return join(parts);
}

/** Markdown would otherwise eat a release's brackets and underscores. */
export function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_{}[\]()#+.!|>~-]/g, "\\$&");
}

/** The file list the detail modal shows, largest first. */
export function fileListMarkdown(name: string, files: TorrentFile[]): string {
  const title = `# ${escapeMarkdown(name)}`;
  if (files.length === 0) {
    return `${title}\n\n_This torrent reports no files._`;
  }
  const lines = [...files]
    .sort((a, b) => b.length - a.length)
    .map((file) => `- ${formatBytes(file.length)} — ${escapeMarkdown(file.path)}`);
  return [title, "", ...lines].join("\n");
}
