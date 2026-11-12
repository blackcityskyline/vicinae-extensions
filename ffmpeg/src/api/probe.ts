/**
 * `ffprobe -v error -print_format json -show_format -show_streams`.
 *
 * Measured on ffprobe n9.0.2: every number is a string, a missing field is an
 * absent key rather than `null`, and a file it cannot read exits 1 with the
 * reason on stderr and `{}` on stdout.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type Stream = {
  index?: number;
  codec_type?: string;
  codec_name?: string;
  codec_long_name?: string;
  profile?: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  avg_frame_rate?: string;
  pix_fmt?: string;
  sample_rate?: string;
  channels?: number;
  channel_layout?: string;
  bit_rate?: string;
  duration?: string;
  nb_frames?: string;
  color_space?: string;
  color_range?: string;
  tags?: Record<string, string>;
};

export type Probe = {
  format: {
    format_name?: string;
    format_long_name?: string;
    duration?: string;
    bit_rate?: string;
    size?: string;
    nb_streams?: number;
    tags?: Record<string, string>;
  };
  streams: Stream[];
};

export class ProbeError extends Error {}

export function parseProbe(json: string): Probe {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new ProbeError("ffprobe printed something that is not JSON.");
  }

  if (parsed === null || typeof parsed !== "object") throw new ProbeError("ffprobe printed an empty answer.");
  const probe = parsed as Partial<Probe>;
  if (!Array.isArray(probe.streams)) throw new ProbeError("ffprobe printed no stream list.");

  return { format: probe.format ?? {}, streams: probe.streams };
}

export function probeFailure(error: unknown): string {
  const failure = error as { code?: string; stderr?: string; message?: string };
  if (failure.code === "ENOENT") return "ffprobe is not installed. On Arch it is in the ffmpeg package.";

  const stderr = (failure.stderr ?? "").trim().split("\n").filter(Boolean).pop();
  if (stderr !== undefined && stderr !== "") return stderr;

  return failure.message ?? String(error);
}

export async function probe(file: string, binary = "ffprobe"): Promise<Probe> {
  try {
    const { stdout } = await execFileAsync(
      binary,
      ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file],
      { timeout: 20_000, maxBuffer: 8 * 1024 * 1024 },
    );
    return parseProbe(stdout);
  } catch (error) {
    throw new ProbeError(probeFailure(error));
  }
}
