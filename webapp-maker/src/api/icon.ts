import { execFile } from "node:child_process";
import { copyFile, open, rename, rm } from "node:fs/promises";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * What the first bytes say the file is, or null for anything that is not an
 * image a launcher can draw. A site answers 200 with an HTML error page as often
 * as it answers with an icon, and that page must not end up as one.
 */
export function imageKind(head: Buffer): "png" | "jpeg" | "gif" | "webp" | "ico" | null {
  if (head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "jpeg";
  if (head.subarray(0, 4).toString("latin1") === "GIF8") return "gif";
  if (head.subarray(0, 4).toString("latin1") === "RIFF" && head.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
  if (head.subarray(0, 4).equals(Buffer.from([0, 0, 1, 0]))) return "ico";
  return null;
}

/** Puts `tmp` at `dest` if it is an image, and removes it either way. */
async function keepIfImage(tmp: string, dest: string): Promise<void> {
  try {
    const file = await open(tmp, "r");
    const head = Buffer.alloc(12);
    try {
      await file.read(head, 0, 12, 0);
    } finally {
      await file.close();
    }
    if (!imageKind(head)) throw new Error("It is not an image");
    await rename(tmp, dest);
  } finally {
    await rm(tmp, { force: true });
  }
}

/**
 * curl rather than Node's HTTP client: it follows redirects, honours the
 * proxy variables, and `env` (the Environment File preference) reaches it.
 */
const curl = (args: string[], env: NodeJS.ProcessEnv) =>
  run("curl", ["-fsSL", ...args], { env: { ...process.env, ...env }, maxBuffer: 8 * 1024 * 1024 });

async function download(url: string, dest: string, seconds: number, env: NodeJS.ProcessEnv): Promise<void> {
  const tmp = `${dest}.part`;
  try {
    await curl(["--max-time", String(seconds), "-o", tmp, url], env);
  } catch (error) {
    await rm(tmp, { force: true });
    throw new Error(`Could not download ${url}: ${(error as { stderr?: string }).stderr?.trim() || (error as Error).message}`);
  }
  await keepIfImage(tmp, dest);
}

/** Where the page says its touch icon is, resolved against the page's own address. */
export function touchIconUrl(html: string, pageUrl: string): string | null {
  const link = html.match(/<link[^>]*rel=["'][^"']*apple-touch-icon[^"']*["'][^>]*>/i)?.[0];
  const href = link?.match(/href=["']([^"']+)["']/i)?.[1];
  return href ? new URL(href, pageUrl).toString() : null;
}

/** The site's own icon: its touch icon, then `/apple-touch-icon.png`, then Google's favicon service. */
export async function fetchSiteIcon(siteUrl: string, dest: string, env: NodeJS.ProcessEnv = {}): Promise<void> {
  const page = new URL(siteUrl);
  const candidates: string[] = [];
  try {
    const { stdout } = await curl(["--max-time", "5", siteUrl], env);
    const found = touchIconUrl(stdout.slice(0, 100_000), siteUrl);
    if (found) candidates.push(found);
  } catch {
    // An unreachable page only means the fixed addresses below are tried.
  }
  candidates.push(
    `${page.origin}/apple-touch-icon.png`,
    `https://www.google.com/s2/favicons?domain=${page.hostname}&sz=256`,
  );

  for (const candidate of candidates) {
    try {
      await download(candidate, dest, 5, env);
      return;
    } catch {
      // Next candidate.
    }
  }
  throw new Error(`No icon could be fetched for ${siteUrl}`);
}

export const downloadIcon = (url: string, dest: string, env: NodeJS.ProcessEnv = {}): Promise<void> =>
  download(url, dest, 10, env);

export async function copyIcon(source: string, dest: string): Promise<void> {
  const tmp = `${dest}.part`;
  await copyFile(source, tmp);
  await keepIfImage(tmp, dest);
}
