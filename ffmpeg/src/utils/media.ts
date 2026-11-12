/**
 * ffprobe answers strings, and half of them are missing depending on the file.
 * Everything the pane shows is built here, so the tests can compare a real
 * probe — a video, an audio file, a JPEG — with the rows a person sees.
 */

import path from "node:path";

import type { Probe, Stream } from "~/api/probe";

export type Row = { title: string; value: string };
export type Section = { title: string; rows: Row[] };

function number(value: string | number | undefined): number | undefined {
  if (value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** `52.177125` → `0:52`; `3725` → `1:02:05`. */
export function clock(value: string | number | undefined): string | undefined {
  const total = number(value);
  if (total === undefined || total < 0) return undefined;

  const seconds = Math.round(total);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;

  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

/** Decimal units, the way a file manager reports a media file. */
export function size(bytes: string | number | undefined): string | undefined {
  const value = number(bytes);
  if (value === undefined || value < 0) return undefined;

  const units = ["B", "kB", "MB", "GB", "TB"];
  let scaled = value;
  let unit = 0;
  while (scaled >= 1000 && unit < units.length - 1) {
    scaled /= 1000;
    unit += 1;
  }

  const text = unit === 0 || scaled >= 100 ? String(Math.round(scaled)) : scaled.toFixed(1);
  return `${text} ${units[unit] ?? "B"}`;
}

export function bitrate(bits: string | number | undefined): string | undefined {
  const value = number(bits);
  if (value === undefined || value <= 0) return undefined;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} Mbit/s`;
  if (value >= 1000) return `${Math.round(value / 1000)} kbit/s`;
  return `${Math.round(value)} bit/s`;
}

/** `"30000/1001"` → `29.97`; `"0/0"` and `"25/0"` are not rates. */
export function fps(rate: string | undefined): string | undefined {
  if (rate === undefined) return undefined;
  const [top, bottom] = rate.split("/").map((part) => Number(part));
  if (top === undefined || bottom === undefined || !Number.isFinite(top) || bottom === 0 || top === 0) return undefined;

  const value = top / bottom;
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export function resolution(stream: Stream): string | undefined {
  if (stream.width === undefined || stream.height === undefined) return undefined;
  return `${stream.width}×${stream.height}`;
}

/** `1 (mono)`, `2 (stereo)`, `6 (5.1)`, or just the count when the layout is unknown. */
export function channels(count: number | undefined, layout: string | undefined): string | undefined {
  if (count === undefined) return undefined;
  const named = count === 1 ? "mono" : count === 2 ? "stereo" : layout;
  return named === undefined || named === "" ? String(count) : `${count} (${named})`;
}

export function sampleRate(rate: string | undefined): string | undefined {
  const value = number(rate);
  return value === undefined || value <= 0 ? undefined : `${value} Hz`;
}

export function streamKind(type: string | undefined): string {
  switch (type) {
    case "video":
      return "Video";
    case "audio":
      return "Audio";
    case "subtitle":
      return "Subtitle";
    case "attachment":
      return "Attachment";
    case "data":
      return "Data";
    default:
      return type === undefined || type === "" ? "Stream" : type[0]?.toUpperCase() + type.slice(1);
  }
}

/**
 * A still image is one video stream holding one frame: `image2` (JPEG) recorded
 * 0.04 s of duration and no frame count, `png_pipe` has neither. Anything longer
 * than a tenth of a second is a video.
 */
export function isImage(probe: Probe): boolean {
  const container = probe.format.format_name ?? "";
  if (/^(image2|png_pipe|jpeg_pipe|webp_pipe|gif_pipe)$/.test(container)) return true;

  const videos = probe.streams.filter((stream) => stream.codec_type === "video");
  if (videos.length !== 1 || probe.streams.some((stream) => stream.codec_type === "audio")) return false;
  const duration = number(videos[0]?.duration) ?? number(probe.format.duration);
  return duration !== undefined && duration < 0.1;
}

function codec(stream: Stream): string | undefined {
  const name = stream.codec_long_name ?? stream.codec_name;
  if (name === undefined) return undefined;
  return stream.profile === undefined || stream.profile === "" ? name : `${name} (${stream.profile})`;
}

function videoRows(stream: Stream): Row[] {
  const rows: Row[] = [];
  const details = codec(stream);
  if (details !== undefined) rows.push({ title: "Codec", value: details });

  const frame = resolution(stream);
  if (frame !== undefined) rows.push({ title: "Resolution", value: frame });

  const rate = fps(stream.r_frame_rate) ?? fps(stream.avg_frame_rate);
  if (rate !== undefined) rows.push({ title: "Frame Rate", value: `${rate} fps` });

  const pixels = stream.pix_fmt;
  if (pixels !== undefined) rows.push({ title: "Pixel Format", value: pixels });

  const space = stream.color_space;
  if (space !== undefined) rows.push({ title: "Color Space", value: space });

  const rate2 = bitrate(stream.bit_rate);
  if (rate2 !== undefined) rows.push({ title: "Bit Rate", value: rate2 });

  const length = clock(stream.duration);
  if (length !== undefined) rows.push({ title: "Duration", value: length });

  return rows;
}

function audioRows(stream: Stream): Row[] {
  const rows: Row[] = [];
  const details = codec(stream);
  if (details !== undefined) rows.push({ title: "Codec", value: details });

  const rate = sampleRate(stream.sample_rate);
  if (rate !== undefined) rows.push({ title: "Sample Rate", value: rate });

  const output = channels(stream.channels, stream.channel_layout);
  if (output !== undefined) rows.push({ title: "Channels", value: output });

  const speed = bitrate(stream.bit_rate);
  if (speed !== undefined) rows.push({ title: "Bit Rate", value: speed });

  const length = clock(stream.duration);
  if (length !== undefined) rows.push({ title: "Duration", value: length });

  return rows;
}

function tagRows(tags: Record<string, string> | undefined): Row[] {
  if (tags === undefined) return [];
  const wanted = ["title", "artist", "album", "date", "genre", "comment"];
  return wanted
    .filter((key) => tags[key] !== undefined && tags[key] !== "")
    .map((key) => ({ title: key[0]?.toUpperCase() + key.slice(1), value: tags[key] ?? "" }));
}

/** The file section first, then one section per stream, then the container's tags. */
export function describe(probe: Probe, file: string): Section[] {
  const sections: Section[] = [];
  const image = isImage(probe);

  const fileRows: Row[] = [{ title: "Name", value: path.basename(file) }];
  const bytes = size(probe.format.size);
  if (bytes !== undefined) fileRows.push({ title: "Size", value: bytes });

  const container = probe.format.format_long_name ?? probe.format.format_name;
  if (container !== undefined) fileRows.push({ title: "Container", value: container });

  const length = clock(probe.format.duration);
  if (length !== undefined && !image) fileRows.push({ title: "Duration", value: length });

  const overall = bitrate(probe.format.bit_rate);
  if (overall !== undefined && !image) fileRows.push({ title: "Overall Bit Rate", value: overall });

  fileRows.push({ title: "Streams", value: String(probe.streams.length) });
  sections.push({ title: "File", rows: fileRows });

  const counters: Record<string, number> = {};
  for (const stream of probe.streams) {
    const type = stream.codec_type ?? "other";
    counters[type] = (counters[type] ?? 0) + 1;
    const title = image ? "Image" : `${streamKind(type)} Stream ${counters[type]}`;
    const rows = type === "audio" ? audioRows(stream) : videoRows(stream);
    if (rows.length > 0) sections.push({ title, rows });
  }

  const tags = tagRows(probe.format.tags);
  if (tags.length > 0) sections.push({ title: "Tags", rows: tags });

  return sections;
}

/** The text behind "Copy Info", also used as the detail pane's markdown. */
export function toMarkdown(sections: Section[]): string {
  return sections
    .map((section) => `## ${section.title}\n\n${section.rows.map((row) => `- **${row.title}:** ${row.value}`).join("\n")}`)
    .join("\n\n");
}
