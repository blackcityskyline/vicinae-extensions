export const FORMATS = [
  { value: "opus", label: "Opus" },
  { value: "mp3", label: "MP3" },
  { value: "flac", label: "FLAC" },
  { value: "m4a", label: "M4A (AAC)" },
  { value: "wav", label: "WAV" },
  { value: "mp4", label: "MP4" },
  { value: "mkv", label: "MKV" },
  { value: "webm", label: "WebM" },
] as const;

export type Format = (typeof FORMATS)[number]["value"];

export interface Option {
  value: string;
  label: string;
}

const VIDEO = new Set<string>(["mp4", "mkv", "webm"]);
const LOSSLESS = new Set<string>(["flac", "wav"]);

export function isVideo(format: string): boolean {
  return VIDEO.has(format);
}

export function isLossless(format: string): boolean {
  return LOSSLESS.has(format);
}

export function formatLabel(format: string): string {
  return FORMATS.find((entry) => entry.value === format)?.label ?? format;
}

export function qualityOptions(format: string): Option[] {
  if (isVideo(format)) {
    return [
      { value: "best", label: "Best available" },
      { value: "2160", label: "2160p (4K)" },
      { value: "1440", label: "1440p" },
      { value: "1080", label: "1080p" },
      { value: "720", label: "720p" },
      { value: "480", label: "480p" },
      { value: "360", label: "360p" },
    ];
  }
  if (isLossless(format)) {
    return [{ value: "best", label: format === "flac" ? "Lossless FLAC" : "Lossless PCM" }];
  }
  const bitrates = format === "opus" ? ["192K", "160K", "128K", "96K", "64K"] : ["320K", "256K", "192K", "128K", "96K"];
  return [
    { value: "best", label: format === "mp3" ? "Best (V0 VBR)" : "Best available" },
    ...bitrates.map((value) => ({ value, label: `${value.slice(0, -1)} kbps` })),
  ];
}

/** `~` is what people type in a folder field; yt-dlp does not expand it. */
export function expandHome(path: string, home: string): string {
  const trimmed = path.trim();
  if (trimmed === "~") return home;
  if (trimmed.startsWith("~/")) return `${home}/${trimmed.slice(2)}`;
  return trimmed;
}

export function defaultFolder(format: string, audioFolder: string, videoFolder: string): string {
  return isVideo(format) ? videoFolder : audioFolder;
}
