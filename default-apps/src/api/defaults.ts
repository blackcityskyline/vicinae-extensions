import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { CATEGORIES, getScanDirs, parseDesktopFile, isCandidateForCategory, expandHome } from "~/utils/defaults";

export type Candidate = { id: string; name: string };

export async function scanCandidates(): Promise<Record<string, Candidate[]>> {
  const result: Record<string, Candidate[]> = {};
  for (const cat of CATEGORIES) {
    result[cat.key] = [];
  }
  const seen = new Set<string>();
  const queue: Array<{ file: string; path: string }> = [];
  for (const dir of getScanDirs()) {
    const abs = expandHome(dir);
    try {
      const names = await readdir(abs);
      names.sort();
      for (const file of names) {
        if (!file.endsWith(".desktop")) continue;
        if (seen.has(file)) continue;
        seen.add(file);
        queue.push({ file, path: join(abs, file) });
      }
    } catch {}
  }
  for (const entry of queue) {
    try {
      const text = await readFile(entry.path, "utf8");
      const app = parseDesktopFile(text);
      if (!app.name || app.hidden) continue;
      app.id = entry.file;
      for (const cat of CATEGORIES) {
        if (isCandidateForCategory(app, cat)) {
          for (const mime of cat.mimes) {
            if (app.mimes.has(mime)) {
              if (!result[cat.key]) result[cat.key] = [];
              result[cat.key]!.push({ id: entry.file, name: app.name });
              break;
            }
          }
        }
      }
    } catch {}
  }
  for (const cat of CATEGORIES) {
    result[cat.key] = result[cat.key] || [];
    result[cat.key]!.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  }
  return result;
}

export async function queryDefaults(): Promise<Record<string, string | null>> {
  const result: Record<string, string | null> = {};
  for (const cat of CATEGORIES) {
    try {
      const { stdout } = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
        execFile("xdg-mime", ["query", "default", cat.mimes[0] as string], (err: any, stdout: any, stderr: any) => {
          if (err) reject(err);
          else resolve({ stdout: String(stdout), stderr: String(stderr) });
        });
      });
      const id = stdout.trim();
      result[cat.key] = id === "" ? null : id;
    } catch {
      result[cat.key] = null;
    }
  }
  return result;
}

export async function applyDefault(categoryKey: string, appId: string): Promise<boolean> {
  const cat = CATEGORIES.find((c) => c.key === categoryKey);
  if (!cat) return false;
  const argv: string[] = ["default", appId];
  for (const m of cat.mimes) argv.push(m);
  try {
    await new Promise((resolve, reject) => {
      execFile("xdg-mime", argv, (err: any) => {
        if (err) reject(err);
        else resolve(undefined);
      });
    });
    return true;
  } catch {
    return false;
  }
}
