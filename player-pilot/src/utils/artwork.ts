import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Cache } from "@vicinae/api";

import { imageSize, type Size } from "~/lib/cards";

export type Artwork = { href: string; size?: Size };

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
 * The cover as a data URI plus its real shape, or an empty `href` when it cannot
 * be read. An SVG can only carry the picture as a URI, the renderer does not
 * fetch remote ones, and the card frames the picture by its shape.
 */
export async function artworkFor(url: string): Promise<Artwork> {
  const cached = cache.get(url);
  if (cached !== undefined) return JSON.parse(cached) as Artwork;

  try {
    const bytes = await fetchArtwork(url);
    const size = imageSize(bytes);
    const href = `data:${mimeOf(bytes)};base64,${Buffer.from(bytes).toString("base64")}`;
    const artwork: Artwork = size ? { href, size } : { href };
    cache.set(url, JSON.stringify(artwork), { ttl: TTL });
    return artwork;
  } catch (error) {
    console.error("Failed to load artwork", error);
    return { href: "" };
  }
}
