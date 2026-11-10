import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { defaultFolder, expandHome, isVideo, qualityOptions } from "../src/utils/formats.ts";
import {
  formatBytes,
  formatEta,
  jobScript,
  lastFile,
  latestProgress,
  parseProgress,
  percent,
  progressText,
  splitLinks,
  thumbnailFile,
  ytdlpArgs,
  type JobOptions,
} from "../src/utils/job.ts";

let checks = 0;
function check(name: string, body: () => void) {
  try {
    body();
    checks++;
    console.log(`ok   ${name}`);
  } catch (error) {
    console.log(`FAIL ${name}`);
    console.log(`     ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  }
}

const paths = { log: "/tmp/job/log.txt", exit: "/tmp/job/exit.txt", title: "/tmp/job/title.txt" };

function options(overrides: Partial<JobOptions> = {}): JobOptions {
  return {
    url: "https://example.com/watch?v=1",
    format: "opus",
    quality: "best",
    dir: "/home/you/Music",
    playlists: false,
    cookies: "none",
    metadata: true,
    mutagen: false,
    subtitles: false,
    subtitleLanguage: "en",
    ...overrides,
  };
}

function paired(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

check("opus is extracted and re-encoded at 192k unless the source is Opus", () => {
  const args = ytdlpArgs(options(), paths);
  assert.equal(paired(args, "-f"), "bestaudio/best");
  assert.ok(args.includes("-x"));
  assert.equal(paired(args, "--audio-format"), "opus");
  assert.equal(paired(args, "--audio-quality"), "192K");
  assert.equal(paired(args, "-P"), "/home/you/Music");
  assert.equal(paired(args, "-o"), "%(title)s.%(ext)s");
  assert.equal(args[args.length - 1], "https://example.com/watch?v=1");
  assert.ok(args.includes("--no-playlist"));
  assert.ok(args.includes("--embed-metadata"));
  assert.ok(!args.includes("--embed-thumbnail"));
});

check("mp3 gets V0 for best and ffmpeg cover art without mutagen", () => {
  const args = ytdlpArgs(options({ format: "mp3" }), paths);
  assert.equal(paired(args, "--audio-quality"), "0");
  assert.ok(args.includes("--embed-thumbnail"));
  assert.equal(paired(args, "--convert-thumbnails"), "jpg");

  const fixed = ytdlpArgs(options({ format: "mp3", quality: "320K" }), paths);
  assert.equal(paired(fixed, "--audio-quality"), "320K");
});

check("flac skips cover art without mutagen and takes it with mutagen", () => {
  const without = ytdlpArgs(options({ format: "flac" }), paths);
  assert.ok(!without.includes("--embed-thumbnail"));
  assert.ok(!without.includes("--audio-quality"));

  const withMutagen = ytdlpArgs(options({ format: "flac", mutagen: true }), paths);
  assert.ok(withMutagen.includes("--embed-thumbnail"));
});

check("video selectors keep the chosen cap and the container flags", () => {
  const mp4 = ytdlpArgs(options({ format: "mp4", quality: "1080" }), paths);
  assert.equal(paired(mp4, "-f"), "bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[height<=1080][ext=mp4]/bv*[height<=1080]+ba/b[height<=1080]");
  assert.equal(paired(mp4, "--merge-output-format"), "mp4");
  assert.equal(paired(mp4, "--remux-video"), "mp4");

  const webm = ytdlpArgs(options({ format: "webm", quality: "best" }), paths);
  assert.equal(paired(webm, "-f"), "bv*[ext=webm]+ba[ext=webm]/b[ext=webm]/bv*+ba/b");
  assert.equal(paired(webm, "--recode-video"), "webm");

  const mkv = ytdlpArgs(options({ format: "mkv" }), paths);
  assert.equal(paired(mkv, "--merge-output-format"), "mkv");
  assert.equal(paired(mkv, "--remux-video"), "mkv");
});

check("playlists and browser cookies are only asked for when chosen", () => {
  const plain = ytdlpArgs(options(), paths);
  assert.ok(!plain.includes("--yes-playlist"));
  assert.ok(!plain.includes("--cookies-from-browser"));

  const full = ytdlpArgs(options({ playlists: true, cookies: "firefox" }), paths);
  assert.ok(full.includes("--yes-playlist"));
  assert.equal(paired(full, "--cookies-from-browser"), "firefox");
});

check("subtitles are off unless asked for, and then in the chosen language", () => {
  const off = ytdlpArgs(options(), paths);
  assert.ok(off.includes("--no-write-subs"));
  assert.ok(off.includes("--no-write-auto-subs"));
  assert.ok(!off.includes("--sub-langs"));

  const ru = ytdlpArgs(options({ subtitles: true, subtitleLanguage: "ru" }), paths);
  assert.ok(ru.includes("--write-subs"));
  assert.ok(ru.includes("--write-auto-subs"));
  assert.equal(paired(ru, "--sub-langs"), "ru");
  assert.equal(paired(ru, "--convert-subs"), "srt");

  const every = ytdlpArgs(options({ subtitles: true, subtitleLanguage: "all" }), paths);
  assert.equal(paired(every, "--sub-langs"), "all");
});

check("the thumbnail format skips the media and keeps the chosen image format", () => {
  const best = ytdlpArgs(options({ format: "thumbnail" }), paths);
  assert.ok(best.includes("--skip-download"));
  assert.ok(best.includes("--write-thumbnail"));
  assert.ok(best.includes("--no-quiet"));
  assert.ok(!best.includes("--convert-thumbnails"));
  assert.ok(!best.includes("--embed-metadata"));
  assert.ok(!best.includes("-x"));
  assert.equal(best[best.length - 1], "https://example.com/watch?v=1");

  const webp = ytdlpArgs(options({ format: "thumbnail", quality: "webp" }), paths);
  assert.equal(paired(webp, "--convert-thumbnails"), "webp");

  assert.equal(
    thumbnailFile('Writing video thumbnail 42 to: /home/you/Videos/My video.webp\n', "best"),
    "/home/you/Videos/My video.webp",
  );
  assert.equal(
    thumbnailFile('Writing video thumbnail 42 to: /home/you/Videos/My video.webp\n', "png"),
    "/home/you/Videos/My video.png",
  );
  assert.equal(thumbnailFile("no thumbnail here", "best"), null);

  assert.deepEqual(
    qualityOptions("thumbnail").map((option) => option.value),
    ["best", "jpg", "png", "webp"],
  );
  assert.equal(defaultFolder("thumbnail", "~/Music", "~/Videos"), "~/Videos");
});

check("format catalogue offers the qualities each container can take", () => {
  assert.deepEqual(
    qualityOptions("flac").map((option) => option.value),
    ["best"],
  );
  assert.ok(qualityOptions("opus").some((option) => option.value === "192K"));
  assert.ok(qualityOptions("mp3").some((option) => option.value === "320K"));
  assert.ok(qualityOptions("mp4").some((option) => option.value === "2160"));
  assert.equal(isVideo("webm"), true);
  assert.equal(isVideo("mp3"), false);
  assert.equal(defaultFolder("mp4", "~/Music", "~/Videos"), "~/Videos");
  assert.equal(expandHome("~/Music/Lossless", "/home/you"), "/home/you/Music/Lossless");
  assert.equal(expandHome("~", "/home/you"), "/home/you");
  assert.equal(expandHome("/srv/audio", "/home/you"), "/srv/audio");
});

check("progress lines are read from the newest one and turned into a summary", () => {
  const parsed = parseProgress("PROGRESS:524288|1048576|NA|262144|2.0");
  assert.deepEqual(parsed, { downloaded: 524288, total: 1048576, speed: 262144, eta: 2 });
  assert.equal(percent(parsed), 50);
  assert.equal(progressText(parsed), "50% · 256 KiB/s · 0:02");
  assert.equal(parseProgress("not a marker"), null);
  assert.equal(percent(parseProgress("PROGRESS:10|NA|40|NA|NA")), 25);

  const log = "PROGRESS:1|10|NA|NA|NA\nnoise\nPROGRESS:9|10|NA|NA|NA\n";
  assert.equal(percent(latestProgress(log)), 90);
  assert.equal(formatBytes(1536), "1.5 KiB");
  assert.equal(formatBytes(null), "");
  assert.equal(formatEta(3723), "1:02:03");
  assert.equal(formatEta(-1), "");
  assert.deepEqual(splitLinks(" https://a,https://b\nhttps://a "), ["https://a", "https://b"]);
});

check("the final file marker is JSON, so a title with quotes still parses", () => {
  assert.equal(lastFile('FILE:"/home/you/Music/It\'s tea.mp3"'), "/home/you/Music/It's tea.mp3");
  assert.equal(lastFile('FILE:"/a.mp3"\nFILE:"/b.mp3"'), "/b.mp3");
  assert.equal(lastFile("nothing"), null);
});

check("the shell runs yt-dlp with the link intact, records the code and notifies", () => {
  const dir = mkdtempSync(join(tmpdir(), "ytdlp-"));
  const bin = join(dir, "bin");
  mkdirSync(bin);
  writeFileSync(
    join(bin, "yt-dlp"),
    [
      "#!/bin/sh",
      `printf '%s\\n' "$@" > ${join(dir, "args")}`,
      "printf 'PROGRESS:50|100|NA|1000|2\\n'",
      "printf 'FILE:\"/tmp/x/out.mp3\"\\n'",
      "exit ${FAKE_CODE:-0}",
    ].join("\n"),
  );
  chmodSync(join(bin, "yt-dlp"), 0o755);
  writeFileSync(
    join(bin, "notify-send"),
    `#!/bin/sh\nprintf '%s\\n' "$@" > ${join(dir, "notify")}\n`,
  );
  chmodSync(join(bin, "notify-send"), 0o755);

  const url = `https://example.com/it's a (test)?x=1`;
  const jobPaths = { log: join(dir, "log"), exit: join(dir, "exit"), title: join(dir, "title") };
  writeFileSync(jobPaths.title, "It's tea\n");

  try {
    const script = jobScript(options({ url }), jobPaths);
    const run = spawnSync("sh", ["-c", script], {
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
      encoding: "utf8",
    });
    assert.equal(run.status, 0);
    assert.equal(readFileSync(jobPaths.exit, "utf8").trim(), "0");

    const args = readFileSync(join(dir, "args"), "utf8").split("\n");
    assert.equal(args[args.length - 1], "");
    assert.equal(args[args.length - 2], url);
    assert.match(readFileSync(jobPaths.log, "utf8"), /PROGRESS:50\|100/);
    assert.equal(lastFile(readFileSync(jobPaths.log, "utf8")), "/tmp/x/out.mp3");

    const notify = readFileSync(join(dir, "notify"), "utf8").split("\n");
    assert.ok(notify.includes("Download finished"));
    assert.ok(notify.includes("It's tea"));

    writeFileSync(jobPaths.title, "It's tea\n");
    spawnSync("sh", ["-c", jobScript(options({ url }), jobPaths)], {
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, FAKE_CODE: "3" },
      encoding: "utf8",
    });
    assert.equal(readFileSync(jobPaths.exit, "utf8").trim(), "3");
    assert.ok(readFileSync(join(dir, "notify"), "utf8").includes("Download failed"));
    assert.equal(existsSync(jobPaths.exit), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

console.log(`\n${checks} checks passed`);
if (process.exitCode) process.exit(process.exitCode);
