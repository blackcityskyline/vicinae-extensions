import { imageSize, type Size } from "~/lib/pane";

export type Artwork = { href: string; size?: Size };

/**
 * One fetch per picture per command process: moving the selection refetches, but
 * a picture already embedded as a data URI is reused, and the pane cannot draw a
 * remote image from inside an SVG anyway.
 */
const artworks = new Map<string, Promise<Artwork>>();
/** Base64 covers are ~50 KB; a browse session can select hundreds of rows. */
const LIMIT = 40;

function mimeOf(bytes: Uint8Array): string {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return "image/gif";
  if (bytes[8] === 0x57 && bytes[9] === 0x45) return "image/webp";
  return "image/jpeg";
}

async function load(url: string): Promise<Artwork> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const size = imageSize(bytes);
  const href = `data:${mimeOf(bytes)};base64,${Buffer.from(bytes).toString("base64")}`;
  return size ? { href, size } : { href };
}

async function firstOf(url: string, fallback?: string): Promise<Artwork> {
  try {
    return await load(url);
  } catch (error) {
    if (!fallback) throw error;
    return load(fallback);
  }
}

/**
 * The picture as a data URI plus its real shape, or nothing when it cannot be
 * read. `fallback` is the same picture in another size: the 1280×720 frame is
 * not served for every upload.
 */
export function artworkFor(url: string | undefined, fallback?: string): Promise<Artwork> {
  if (!url) return Promise.resolve({ href: "" });

  const cached = artworks.get(url);
  if (cached) return cached;

  const promise = firstOf(url, fallback).catch((error: unknown) => {
    console.error("Failed to load artwork", error);
    return { href: "" };
  });
  if (artworks.size >= LIMIT) {
    const oldest = artworks.keys().next();
    if (!oldest.done) artworks.delete(oldest.value);
  }
  artworks.set(url, promise);
  return promise;
}
