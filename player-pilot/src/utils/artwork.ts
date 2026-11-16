import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Cache } from "@vicinae/api";

const cache = new Cache({ namespace: "artwork", capacity: 4 * 1024 * 1024 });
/** A day, so switching tracks does not re-download the same cover. */
const TTL = 24 * 60 * 60 * 1000;

function mimeOf(bytes: Uint8Array): string {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return "image/gif";
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57) return "image/webp";
  return "image/jpeg";
}

async function fetchArtwork(url: string): Promise<Uint8Array> {
  // Firefox hands MPRIS a `file:` URI for its own downloads.
  if (url.startsWith("file:")) return new Uint8Array(await readFile(fileURLToPath(url)));
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * The bytes to embed in the cover card, as a data URI, or `""` when the artwork
 * cannot be read. An SVG can only carry the picture as a URI, and the renderer
 * does not fetch remote ones.
 */
export async function artworkHref(url: string): Promise<string> {
  const cached = cache.get(url);
  if (cached !== undefined) return cached;

  try {
    const bytes = await fetchArtwork(url);
    const href = `data:${mimeOf(bytes)};base64,${Buffer.from(bytes).toString("base64")}`;
    cache.set(url, href, { ttl: TTL });
    return href;
  } catch (error) {
    console.error("Failed to load artwork", error);
    return "";
  }
}
