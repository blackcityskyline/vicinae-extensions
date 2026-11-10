import { environment } from "@vicinae/api";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

import { isThumbnail } from "../utils/formats.ts";
import {
  formatBytes,
  jobScript,
  lastFile,
  latestProgress,
  progressText,
  thumbnailFile,
  type JobOptions,
  type JobPaths,
  type Progress,
} from "../utils/job.ts";

export interface Job extends JobOptions {
  id: string;
  createdAt: number;
  /** The shell that runs yt-dlp, detached so it survives this window. */
  pid: number | null;
  cancelled: boolean;
}

export type State = "running" | "done" | "failed" | "cancelled";

function jobsRoot(): string {
  return join(environment.supportPath, "jobs");
}

function jobDir(id: string): string {
  return join(jobsRoot(), id);
}

function pathsFor(id: string): JobPaths {
  const dir = jobDir(id);
  return { log: join(dir, "log.txt"), exit: join(dir, "exit.txt"), title: join(dir, "title.txt") };
}

function readTail(path: string, bytes = 64 * 1024): string {
  try {
    const content = readFileSync(path, "utf8");
    return content.length > bytes ? content.slice(-bytes) : content;
  } catch {
    return "";
  }
}

/** A process started by a worker can be a zombie; /proc tells the truth. */
export function alive(pid: number | null): boolean {
  if (!pid) return false;
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    const state = stat.slice(stat.lastIndexOf(")") + 2, stat.lastIndexOf(")") + 3);
    return state !== "Z" && state !== "X";
  } catch {
    return false;
  }
}

export function readJobs(): Job[] {
  let ids: string[] = [];
  try {
    ids = readdirSync(jobsRoot(), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }

  const jobs: Job[] = [];
  for (const id of ids) {
    try {
      const parsed = JSON.parse(readFileSync(join(jobDir(id), "meta.json"), "utf8")) as Partial<Job>;
      if (typeof parsed.url !== "string" || typeof parsed.format !== "string" || typeof parsed.dir !== "string") continue;
      jobs.push({
        id,
        url: parsed.url,
        format: parsed.format,
        quality: typeof parsed.quality === "string" ? parsed.quality : "best",
        dir: parsed.dir,
        playlists: parsed.playlists === true,
        cookies: typeof parsed.cookies === "string" ? parsed.cookies : "none",
        metadata: parsed.metadata === true,
        mutagen: parsed.mutagen === true,
        subtitles: parsed.subtitles === true,
        subtitleLanguage: typeof parsed.subtitleLanguage === "string" ? parsed.subtitleLanguage : "en",
        createdAt: typeof parsed.createdAt === "number" ? parsed.createdAt : 0,
        pid: typeof parsed.pid === "number" ? parsed.pid : null,
        cancelled: parsed.cancelled === true,
      });
    } catch {
      // A half-written or hand-edited job: leave it out.
    }
  }
  return jobs.sort((left, right) => right.createdAt - left.createdAt);
}

export function stateOf(job: Job): State {
  if (job.cancelled) return "cancelled";
  if (existsSync(pathsFor(job.id).exit)) {
    const code = Number.parseInt(readTail(pathsFor(job.id).exit).trim(), 10);
    return code === 0 ? "done" : "failed";
  }
  return alive(job.pid) ? "running" : "failed";
}

export function progressOf(job: Job): Progress | null {
  return latestProgress(readTail(pathsFor(job.id).log));
}

export function fileOf(job: Job): string | null {
  const log = readTail(pathsFor(job.id).log);
  return isThumbnail(job.format) ? thumbnailFile(log, job.quality) : lastFile(log);
}

/** What the row says: the finished file's name, else the title yt-dlp saw. */
export function titleOf(job: Job): string {
  const file = fileOf(job);
  if (file) return file.split("/").pop() || job.url;
  const title = readTail(pathsFor(job.id).title).split("\n")[0]?.trim();
  return title || job.url;
}

export function subtitleOf(job: Job): string {
  const subs = job.subtitles ? ` · subs ${job.subtitleLanguage}` : "";
  const state = stateOf(job);
  if (state === "running") {
    const text = progressText(progressOf(job));
    if (text) return `${job.format.toUpperCase()}${subs} · ${text}`;
  }
  if (state === "done") {
    const progress = progressOf(job);
    const size = formatBytes(progress?.total ?? null);
    return `${job.format.toUpperCase()}${subs} · ${size ? `${size} · ` : ""}${job.dir}`;
  }
  return `${job.format.toUpperCase()}${subs} · ${job.dir}`;
}

function writeMeta(job: Job): void {
  writeFileSync(join(jobDir(job.id), "meta.json"), `${JSON.stringify(job, null, 2)}\n`);
}

export function startJob(options: JobOptions): Job {
  const id = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
  const dir = jobDir(id);
  mkdirSync(dir, { recursive: true });
  mkdirSync(options.dir, { recursive: true });

  const job: Job = { ...options, id, createdAt: Date.now(), pid: null, cancelled: false };
  writeMeta(job);

  const child = spawn("sh", ["-c", jobScript(options, pathsFor(id))], { detached: true, stdio: "ignore" });
  child.on("error", () => {
    // A shell that cannot start leaves no exit file; the row shows up failed.
  });
  child.unref();

  job.pid = child.pid ?? null;
  writeMeta(job);
  return job;
}

export function cancelJob(job: Job): void {
  const next = { ...job, cancelled: true };
  writeMeta(next);
  if (!alive(job.pid)) return;
  try {
    // Detached, so the shell leads its own process group: yt-dlp goes too.
    process.kill(-(job.pid as number), "SIGTERM");
  } catch {
    // It died between the check and the signal.
  }
}

export function deleteJob(job: Job): void {
  cancelJob(job);
  rmSync(jobDir(job.id), { recursive: true, force: true });
}

/** Opus and FLAC cover art is written by mutagen; without it yt-dlp skips it. */
export function hasMutagen(): boolean {
  return spawnSync("python3", ["-c", "import mutagen"], { stdio: "ignore" }).status === 0;
}
