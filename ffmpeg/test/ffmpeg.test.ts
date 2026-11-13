import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { parseProbe, probe, ProbeError, probeFailure, type Probe } from "../src/api/probe.ts";
import { clipboardFile } from "../src/utils/files.ts";
import {
  outputPath,
  parseClock,
  previewArgs,
  readDuration,
  readPercent,
  rotateArgs,
  rotationSuffix,
  videoLoopArgs,
} from "../src/utils/ffmpeg.ts";
import {
  bitrate,
  channels,
  clock,
  describe,
  fps,
  isImage,
  resolution,
  sampleRate,
  size,
  streamKind,
  toMarkdown,
} from "../src/utils/media.ts";

let passed = 0;
let failed = 0;
let skipped = 0;

async function check(name: string, body: () => void | Promise<void>): Promise<void> {
  try {
    await body();
    passed++;
    console.log(`ok   ${name}`);
  } catch (error) {
    failed++;
    console.log(`FAIL ${name}: ${(error as Error).message}`);
  }
}

function skip(name: string, reason: string): void {
  skipped++;
  console.log(`SKIP ${name}: ${reason}`);
}

function hasFfprobe(): boolean {
  try {
    execFileSync("ffprobe", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const VIDEO: Probe = {
  format: {
    format_name: "mov,mp4,m4a,3gp,3g2,mj2",
    format_long_name: "QuickTime / MOV",
    duration: "2.000000",
    bit_rate: "196460",
    size: "49115",
    nb_streams: 2,
    tags: { title: "Test", artist: "" },
  },
  streams: [
    {
      codec_type: "video",
      codec_name: "h264",
      codec_long_name: "H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10",
      profile: "High",
      width: 1280,
      height: 720,
      r_frame_rate: "30/1",
      avg_frame_rate: "30/1",
      pix_fmt: "yuv420p",
      bit_rate: "111564",
      duration: "2.000000",
      nb_frames: "60",
    },
    {
      codec_type: "audio",
      codec_name: "aac",
      codec_long_name: "AAC (Advanced Audio Coding)",
      sample_rate: "44100",
      channels: 1,
      channel_layout: "mono",
      bit_rate: "69702",
      duration: "2.000000",
    },
  ],
};

const IMAGE: Probe = {
  format: {
    format_name: "image2",
    format_long_name: "image2 sequence",
    duration: "0.040000",
    bit_rate: "192960400",
    size: "964802",
    nb_streams: 1,
  },
  streams: [
    {
      codec_type: "video",
      codec_name: "mjpeg",
      codec_long_name: "Motion JPEG",
      profile: "Baseline",
      width: 3024,
      height: 4032,
      r_frame_rate: "25/1",
      duration: "0.040000",
      pix_fmt: "yuvj420p",
    },
  ],
};

const AUDIO: Probe = {
  format: {
    format_name: "mp3",
    format_long_name: "MP2/3 (MPEG audio layer 2/3)",
    duration: "52.177125",
    bit_rate: "128000",
    size: "834834",
    nb_streams: 1,
  },
  streams: [
    {
      codec_type: "audio",
      codec_name: "mp3",
      codec_long_name: "MP3 (MPEG audio layer 3)",
      sample_rate: "44100",
      channels: 2,
      channel_layout: "stereo",
      bit_rate: "128000",
      duration: "52.177125",
    },
  ],
};

function rows(probe: Probe, file: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const section of describe(probe, file)) {
    for (const row of section.rows) map.set(`${section.title} / ${row.title}`, row.value);
  }
  return map;
}

/** A real probe, generated here, so the parser is checked against ffprobe itself. */
async function liveProbe(): Promise<void> {
  if (!hasFfprobe()) {
    skip("a generated mp4 probes as video with audio", "ffprobe is not installed");
    skip("a non-media file is an error with ffprobe's own words", "ffprobe is not installed");
    return;
  }

  const dir = mkdtempSync(path.join(os.tmpdir(), "ffmpeg-test-"));
  const video = path.join(dir, "sample.mp4");
  const text = path.join(dir, "note.txt");

  try {
    execFileSync(
      "ffmpeg",
      ["-v", "error", "-f", "lavfi", "-i", "testsrc=size=1280x720:rate=30", "-f", "lavfi", "-i",
       "sine=frequency=440", "-t", "2", "-c:v", "libx264", "-c:a", "aac", "-y", video],
      { stdio: "ignore" },
    );
    writeFileSync(text, "not media\n");

    await check("a generated mp4 probes as video with audio", async () => {
      const result = await probe(video);
      const sections = describe(result, video);
      assert.deepEqual(
        sections.map((section) => section.title),
        ["File", "Video Stream 1", "Audio Stream 1"],
      );

      const all = rows(result, video);
      assert.equal(all.get("Video Stream 1 / Resolution"), "1280×720");
      assert.equal(all.get("Video Stream 1 / Frame Rate"), "30 fps");
      assert.equal(all.get("File / Duration"), "0:02");
      assert.equal(all.get("Audio Stream 1 / Sample Rate"), "44100 Hz");
      assert.equal(all.get("Audio Stream 1 / Channels"), "1 (mono)");
    });

    await check("a non-media file is an error with ffprobe's own words", async () => {
      await assert.rejects(
        () => probe(text),
        (error: Error) => error instanceof ProbeError && /Invalid data found/.test(error.message),
      );
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  await check("a duration reads as minutes and seconds, hours only when needed", () => {
    assert.equal(clock("52.177125"), "0:52");
    assert.equal(clock("3725"), "1:02:05");
    assert.equal(clock("60"), "1:00");
    assert.equal(clock(undefined), undefined);
    assert.equal(clock("N/A"), undefined);
    assert.equal(clock("-1"), undefined);
  });

  await check("sizes use decimal units, the way a file manager reports them", () => {
    assert.equal(size("49115"), "49.1 kB");
    assert.equal(size("964802"), "965 kB");
    assert.equal(size("0"), "0 B");
    assert.equal(size("2500000"), "2.5 MB");
    assert.equal(size(undefined), undefined);
  });

  await check("bitrates pick a unit, and zero is not a bitrate", () => {
    assert.equal(bitrate("128000"), "128 kbit/s");
    assert.equal(bitrate("196460"), "196 kbit/s");
    assert.equal(bitrate("192960400"), "193.0 Mbit/s");
    assert.equal(bitrate("0"), undefined);
    assert.equal(bitrate(undefined), undefined);
  });

  await check("frame rates are a fraction, and 0/0 is not one", () => {
    assert.equal(fps("30/1"), "30");
    assert.equal(fps("30000/1001"), "29.97");
    assert.equal(fps("0/0"), undefined);
    assert.equal(fps("25/0"), undefined);
    assert.equal(fps(undefined), undefined);
  });

  await check("channels name the layout they know", () => {
    assert.equal(channels(1, "mono"), "1 (mono)");
    assert.equal(channels(2, "stereo"), "2 (stereo)");
    assert.equal(channels(6, "5.1"), "6 (5.1)");
    assert.equal(channels(3, undefined), "3");
    assert.equal(channels(undefined, "mono"), undefined);
  });

  await check("a resolution needs both sides, and reads with a multiplication sign", () => {
    assert.equal(resolution({ width: 3024, height: 4032 }), "3024×4032");
    assert.equal(resolution({ width: 3024 }), undefined);
    assert.equal(resolution({}), undefined);
  });

  await check("a sample rate is hertz, and zero is not one", () => {
    assert.equal(sampleRate("44100"), "44100 Hz");
    assert.equal(sampleRate("0"), undefined);
    assert.equal(sampleRate(undefined), undefined);
  });

  await check("stream types are capitalised words", () => {
    assert.equal(streamKind("video"), "Video");
    assert.equal(streamKind("audio"), "Audio");
    assert.equal(streamKind("subtitle"), "Subtitle");
    assert.equal(streamKind("data"), "Data");
    assert.equal(streamKind(undefined), "Stream");
  });

  await check("a still image is recognised, a video and an audio file are not", () => {
    assert.equal(isImage(IMAGE), true);
    assert.equal(isImage(VIDEO), false);
    assert.equal(isImage(AUDIO), false);
  });

  await check("a video shows its streams, its resolution and no image section", () => {
    const sections = describe(VIDEO, "/tmp/sample.mp4");
    assert.deepEqual(
      sections.map((section) => section.title),
      ["File", "Video Stream 1", "Audio Stream 1", "Tags"],
    );

    const all = rows(VIDEO, "/tmp/sample.mp4");
    assert.equal(all.get("File / Name"), "sample.mp4");
    assert.equal(all.get("File / Size"), "49.1 kB");
    assert.equal(all.get("File / Duration"), "0:02");
    assert.equal(all.get("File / Overall Bit Rate"), "196 kbit/s");
    assert.equal(all.get("File / Streams"), "2");
    assert.equal(all.get("Video Stream 1 / Resolution"), "1280×720");
    assert.equal(all.get("Video Stream 1 / Codec"), "H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10 (High)");
    assert.equal(all.get("Video Stream 1 / Pixel Format"), "yuv420p");
    assert.equal(all.get("Audio Stream 1 / Codec"), "AAC (Advanced Audio Coding)");
    assert.equal(all.get("Audio Stream 1 / Resolution"), undefined);
    assert.equal(all.get("Tags / Title"), "Test");
    assert.equal(all.get("Tags / Artist"), undefined);
  });

  await check("an audio file has no resolution row, and an image is not a one-frame video", () => {
    const audio = rows(AUDIO, "/tmp/song.mp3");
    assert.equal(audio.get("File / Duration"), "0:52");
    assert.equal(audio.get("Audio Stream 1 / Channels"), "2 (stereo)");
    assert.equal(audio.get("Audio Stream 1 / Resolution"), undefined);

    const image = describe(IMAGE, "/tmp/photo.jpeg");
    assert.deepEqual(
      image.map((section) => section.title),
      ["File", "Image"],
    );
    const pixels = rows(IMAGE, "/tmp/photo.jpeg");
    assert.equal(pixels.get("Image / Resolution"), "3024×4032");
    assert.equal(pixels.get("Image / Codec"), "Motion JPEG (Baseline)");
    assert.equal(pixels.get("File / Duration"), undefined);
    assert.equal(pixels.get("File / Overall Bit Rate"), undefined);
  });

  await check("the markdown is the same information, one heading per section", () => {
    const markdown = toMarkdown(describe(AUDIO, "/tmp/song.mp3"));
    assert.match(markdown, /^## File\n/);
    assert.match(markdown, /## Audio Stream 1\n/);
    assert.match(markdown, /- \*\*Sample Rate:\*\* 44100 Hz/);
  });

  await check("a probe without a stream list is an error, not an empty file", () => {
    assert.throws(() => parseProbe("{}"), ProbeError);
    assert.throws(() => parseProbe("not json"), ProbeError);
    assert.deepEqual(parseProbe('{"streams":[]}').streams, []);
  });

  await check("a missing ffprobe and a rejected file are told apart", () => {
    assert.match(probeFailure({ code: "ENOENT" }), /not installed/);
    assert.equal(
      probeFailure({ code: "1", stderr: "note.txt: Invalid data found when processing input\n", message: "spawn" }),
      "note.txt: Invalid data found when processing input",
    );
    assert.equal(probeFailure({ message: "boom" }), "boom");
  });

  await check("only an existing file path prefigures the picker", () => {
    const self = __filename;
    assert.equal(clipboardFile(`  ${self}  `), self);
    assert.equal(clipboardFile(path.dirname(self)), undefined);
    assert.equal(clipboardFile(`${self}\n${self}`), undefined);
    assert.equal(clipboardFile(""), undefined);
    assert.equal(clipboardFile("/definitely/not/here.mp4"), undefined);
  });

  await check("ffmpeg's clock lines become seconds and percentages", () => {
    assert.equal(parseClock("00:01:02.50"), 62.5);
    assert.equal(parseClock("1:02"), 62);
    assert.equal(parseClock("nonsense"), undefined);

    assert.equal(readDuration("  Duration: 00:00:02.00, start: 0.000000"), 2);
    assert.equal(readDuration("  Stream #0:0: Video"), undefined);
    assert.equal(readPercent("frame= 15 fps=0.0 q=28.0 size=0kB time=00:00:01.50 bitrate=", 2), 75);
    assert.equal(readPercent("time=00:00:04.00", 2), 100, "a late frame is clamped");
    assert.equal(readPercent("time=00:00:01.00", 0), undefined);
  });

  await check("an output never overwrites a file that exists", () => {
    const taken = new Set(["/media/clip_rotate_right.mp4", "/media/clip_rotate_right.1.mp4"]);
    assert.equal(
      outputPath("/media/clip.mp4", rotationSuffix("right"), ".mp4", (candidate) => taken.has(candidate)),
      "/media/clip_rotate_right.2.mp4",
    );
    assert.equal(
      outputPath("/media/clip.mov", "_videoloop", ".mp4", () => false),
      "/media/clip_videoloop.mp4",
    );
  });

  await check("each action passes ffmpeg an argument vector, not a shell line", () => {
    const loop = videoLoopArgs("/media/in clip.mp4", "/media/out.mp4");
    assert.equal(loop[0], "-i");
    assert.equal(loop[1], "/media/in clip.mp4", "a space in the name is one argument");
    assert.ok(loop.includes("libx264"));
    assert.ok(loop.includes("-an"), "VideoLoop has no audio");
    assert.equal(loop[loop.length - 1], "/media/out.mp4");

    assert.deepEqual(rotateArgs("in.mp4", "out.mp4", "left"), ["-i", "in.mp4", "-vf", "transpose=0", "out.mp4"]);
    assert.deepEqual(rotateArgs("in.mp4", "out.mp4", "right"), ["-i", "in.mp4", "-vf", "transpose=1", "out.mp4"]);
    assert.deepEqual(rotateArgs("in.mp4", "out.mp4", "180"), ["-i", "in.mp4", "-vf", "rotate=PI", "out.mp4"]);
    assert.ok(previewArgs("in.mp4", "out.jpg").some((argument) => argument.includes("scale=480:-2")));
  });

  await liveProbe();

  console.log(failed === 0 ? `\n${passed} passed, ${skipped} skipped` : `\n${failed} check(s) failed, ${skipped} skipped`);
  process.exit(failed === 0 ? 0 : 1);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
