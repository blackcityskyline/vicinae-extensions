import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Move paths to the freedesktop trash.
 *
 * `gio trash` is what the file managers themselves call: it moves the files to
 * the per-user or per-volume trash and records the original location, so they
 * can be restored. The bundled Vicinae `trash()` is not used on purpose — it is
 * `rm -r`, which cannot be undone. Paths that no longer exist count as done so a
 * stale pick never fails a whole batch.
 */
export async function safeTrash(
  paths: string[],
): Promise<{ trashed: string[]; errors: string[] }> {
  const missing: string[] = [];
  const existing: string[] = [];
  for (const p of paths) {
    try {
      await fs.access(p);
      existing.push(p);
    } catch {
      missing.push(p);
    }
  }
  if (existing.length === 0) return { trashed: [...missing], errors: [] };

  try {
    await execFileAsync("gio", ["trash", "--", ...existing], { timeout: 60_000 });
    return { trashed: [...existing, ...missing], errors: [] };
  } catch {
    // One unreadable path fails the whole batch; retry singly to keep the rest.
    const ok: string[] = [...missing];
    const errs: string[] = [];
    for (const p of existing) {
      try {
        await execFileAsync("gio", ["trash", "--", p], { timeout: 60_000 });
        ok.push(p);
      } catch (e) {
        errs.push(`${p}: ${shortError(e)}`);
      }
    }
    return { trashed: ok, errors: errs };
  }
}

export function shortError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  // Shell/binary errors are verbose — keep the informative tail.
  const lines = msg.split("\n").filter((l) => l.trim().length > 0);
  const tail = lines.slice(-2).join(" ").trim();
  const clean = (tail || msg).replace(/\s+/g, " ").trim();
  return clean.length > 220 ? clean.slice(0, 220) + "…" : clean;
}
