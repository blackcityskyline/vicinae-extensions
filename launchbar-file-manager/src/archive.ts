import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as os from "node:os";
import * as path from "node:path";
import { uniqueDest } from "./copy-progress";

const execFileAsync = promisify(execFile);

function isInsideOrEqual(child: string, parent: string): boolean {
  if (child === parent) return true;
  const rel = path.relative(parent, child);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/**
 * Staging lives next to the destination (same volume = fast) unless the
 * destination is inside one of the sources being archived — then staging
 * there would copy the stage into itself, so fall back to the OS temp dir.
 */
async function makeStage(destDir: string, sources: string[]): Promise<string> {
  const parent = sources.some((s) => isInsideOrEqual(destDir, s))
    ? os.tmpdir()
    : destDir;
  return fs.mkdtemp(path.join(parent, ".compress-"));
}

/**
 * ZIP one item next to it. `zip -y` stores symlinks as links instead of
 * following them, and running from the parent keeps the folder itself at the
 * archive top level (macOS `ditto` wrote the contents instead and needed a
 * staging copy to fix that).
 */
export async function compressOne(
  srcPath: string,
  destDir: string,
): Promise<{ dest: string }> {
  const base = path.basename(srcPath);
  const dest = await uniqueDest(destDir, `${base}.zip`);
  await execFileAsync("zip", ["-q", "-r", "-y", dest, base], {
    cwd: path.dirname(srcPath),
  });
  return { dest };
}

/**
 * Compress several items (possibly from different folders) into one ZIP in
 * destDir. Items are staged through a temp dir so the archive has clean
 * top-level names, then the stage is removed.
 */
export async function compressMany(
  sources: string[],
  destDir: string,
  zipBaseName: string,
  onFile?: (done: number, total: number, name: string) => void,
): Promise<{ dest: string }> {
  const dest = await uniqueDest(
    destDir,
    zipBaseName.endsWith(".zip") ? zipBaseName : `${zipBaseName}.zip`,
  );
  const stage = await makeStage(destDir, sources);
  try {
    const stagedNames: string[] = [];
    let done = 0;
    for (const src of sources) {
      const name = await uniqueBasename(stage, path.basename(src));
      await fs.cp(src, path.join(stage, name), { recursive: true });
      stagedNames.push(name);
      done++;
      onFile?.(done, sources.length, path.basename(src));
    }
    await execFileAsync("zip", ["-q", "-r", "-y", dest, ...stagedNames], {
      cwd: stage,
    });
    return { dest };
  } finally {
    await fs.rm(stage, { recursive: true, force: true });
  }
}

async function uniqueBasename(dir: string, base: string): Promise<string> {
  const idx = base.lastIndexOf(".");
  const stem = idx > 0 ? base.slice(0, idx) : base;
  const ext = idx > 0 ? base.slice(idx) : "";
  let candidate = base;
  let n = 2;
  while (true) {
    try {
      await fs.access(path.join(dir, candidate));
      candidate = `${stem} copy${n > 2 ? ` ${n}` : ""}${ext}`;
      n++;
    } catch {
      return candidate;
    }
  }
}

/** Extract a .zip into destDir. Only .zip is supported. */
export async function extractZip(
  archivePath: string,
  destDir: string,
): Promise<void> {
  if (path.extname(archivePath).toLowerCase() !== ".zip") {
    throw new Error(
      `Only .zip archives can be extracted (got ${path.basename(archivePath)})`,
    );
  }
  try {
    await fs.access(archivePath);
  } catch {
    throw new Error(`Archive no longer exists: ${archivePath}`);
  }
  // -o overwrites instead of prompting: there is no terminal to answer.
  await execFileAsync("unzip", ["-q", "-o", archivePath, "-d", destDir]);
}

export function archiveDisplayName(sources: string[]): string {
  if (sources.length === 1) return `${path.basename(sources[0] ?? "")}.zip`;
  return `${path.basename(sources[0] ?? "")} +${sources.length - 1} more.zip`;
}
