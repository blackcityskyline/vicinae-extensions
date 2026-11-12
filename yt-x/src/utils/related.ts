/**
 * YouTube's watch-next reply, cut down to the rows a list can show. The reply is a nested
 * `lockupViewModel` per related video; anything else in it is ignored, so a renderer that
 * changes shape yields fewer rows rather than a broken view.
 */

import type { Entry } from "~/types";

type Raw = Record<string, unknown>;

function asRecord(value: unknown): Raw | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Raw) : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asText(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

/** Keys walk the reply: a string is an object key, a number indexes an array. */
function dig(value: unknown, ...keys: Array<string | number>): unknown {
  let current: unknown = value;
  for (const key of keys) {
    current = typeof key === "number" ? asArray(current)[key] : asRecord(current)?.[key];
    if (current === undefined) return undefined;
  }
  return current;
}

/** "3:24" and "1:02:03" are the two forms the badge uses. */
export function clockSeconds(text: string): number | undefined {
  const parts = text.split(":");
  if (parts.length < 2 || parts.length > 3) return undefined;

  let seconds = 0;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return undefined;
    seconds = seconds * 60 + Number(part);
  }
  return seconds;
}

function durationOf(lockup: Raw): number | undefined {
  for (const overlay of asArray(dig(lockup, "contentImage", "thumbnailViewModel", "overlays"))) {
    for (const badge of asArray(dig(overlay, "thumbnailBottomOverlayViewModel", "badges"))) {
      const text = asText(dig(badge, "thumbnailBadgeViewModel", "text"));
      const seconds = text === undefined ? undefined : clockSeconds(text);
      if (seconds !== undefined) return seconds;
    }
  }
  return undefined;
}

function thumbnailsOf(lockup: Raw): Entry["thumbnails"] {
  const sources = asArray(dig(lockup, "contentImage", "thumbnailViewModel", "image", "sources")).flatMap(
    (source) => {
      const url = asText(dig(source, "url"));
      if (!url) return [];
      const width = dig(source, "width");
      const height = dig(source, "height");
      return [
        {
          url,
          ...(typeof width === "number" ? { width } : {}),
          ...(typeof height === "number" ? { height } : {}),
        },
      ];
    },
  );
  return sources.length === 0 ? undefined : sources;
}

function parseLockup(value: unknown): Entry | null {
  const lockup = asRecord(value);
  if (!lockup) return null;

  const type = asText(lockup.contentType);
  if (type !== undefined && type !== "LOCKUP_CONTENT_TYPE_VIDEO") return null;

  const id = asText(lockup.contentId);
  const metadata = asRecord(dig(lockup, "metadata", "lockupMetadataViewModel"));
  const title = asText(dig(metadata, "title", "content"));
  if (!id || !title) return null;

  const channel = asText(
    dig(metadata, "metadata", "contentMetadataViewModel", "metadataRows", 0, "metadataParts", 0, "text", "content"),
  );
  const duration = durationOf(lockup);
  const thumbnails = thumbnailsOf(lockup);

  return {
    id,
    title,
    url: `https://www.youtube.com/watch?v=${id}`,
    ...(channel ? { channel } : {}),
    ...(duration === undefined ? {} : { duration }),
    ...(thumbnails ? { thumbnails } : {}),
  };
}

/** The related videos of a watch-next reply, in the order YouTube puts them. */
export function parseRelated(value: unknown): Entry[] {
  const results = dig(
    value,
    "contents",
    "twoColumnWatchNextResults",
    "secondaryResults",
    "secondaryResults",
    "results",
  );
  return asArray(results).flatMap((entry) => {
    const video = parseLockup(dig(entry, "lockupViewModel"));
    return video ? [video] : [];
  });
}
