export interface Source {
  /** Whatever the user called it; nothing infers it from the link. */
  name: string;
  /**
   * One link, or several separated by newlines — one playlist entry can hold
   * as many as the user wants, played in the order written.
   */
  url: string;
}

/**
 * Nothing here is fixed: the list is seeded once and then belongs to the user,
 * who renames, removes and adds entries. Silence is not in the list — it is the
 * empty url, the default.
 */
export const SEED_SOURCES: Source[] = [
  { name: "Lofi hip hop", url: "https://www.youtube.com/watch?v=rFZHOHl-L8A" },
  { name: "Lofi house", url: "https://www.youtube.com/watch?v=3PFJ9SETS4M" },
  { name: "Final Fantasy lofi", url: "https://www.youtube.com/watch?v=gEGQciAcSnI" },
  { name: "Rain", url: "rain.oga" },
  { name: "Rain on roof", url: "rain-roof.oga" },
  { name: "White noise", url: "av://lavfi:anoisesrc=color=white:amplitude=0.06" },
  { name: "Brown noise", url: "av://lavfi:anoisesrc=color=brown:amplitude=0.25" },
];

/** One line for a row: the first link, and how many more the entry holds. */
export function summary(url: string): string {
  const all = links(url);
  return all.length > 1 ? `${all[0]} · +${all.length - 1} more` : url;
}

/** The links of one entry, in the order the user wrote them. */
export function links(url: string): string[] {
  return url
    .split("\n")
    .map((link) => link.trim())
    .filter(Boolean);
}

/**
 * A bundled loop is shipped as a bare file name; everything else — a URL, an
 * absolute path, an mpv protocol — is handed to mpv untouched.
 */
export function playableUrl(url: string, assetsPath: string): string {
  return /^(https?:|av:|file:|\/)/i.test(url) ? url : `${assetsPath}/${url}`;
}

/**
 * Upstream's mpv invocation: no video, no terminal, take the best audio track
 * from YouTube through yt-dlp. Every link of the entry follows `--`, so a link
 * is never read as an option, and the playlist loops from the first one again.
 */
export function mpvArgs(url: string, volume: number, assetsPath: string): string[] {
  return [
    "--no-video",
    "--no-terminal",
    "--loop-playlist=inf",
    "--ytdl-format=bestaudio/best",
    `--volume=${clampVolume(String(volume))}`,
    "--",
    ...links(url).map((link) => playableUrl(link, assetsPath)),
  ];
}

export function clampVolume(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return 60;
  return Math.max(0, Math.min(100, parsed));
}

export function nameOf(sources: Source[], url: string): string {
  return sources.find((source) => source.url === url)?.name ?? url;
}

/** Adding a link that is already listed renames it instead of duplicating it. */
export function addSource(sources: Source[], source: Source): Source[] {
  const existing = sources.findIndex((entry) => entry.url === source.url);
  if (existing === -1) return [...sources, source];
  return sources.map((entry, index) => (index === existing ? { ...entry, name: source.name } : entry));
}

export function renameSource(sources: Source[], url: string, name: string): Source[] {
  return sources.map((source) => (source.url === url ? { ...source, name } : source));
}

export function removeSource(sources: Source[], url: string): Source[] {
  return sources.filter((source) => source.url !== url);
}
