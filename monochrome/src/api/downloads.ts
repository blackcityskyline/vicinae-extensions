import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { Toast, showToast } from "@vicinae/api";

import { artist as fetchArtist, releaseTracks } from "~/api/monochrome";
import { attempt } from "~/api/playback";
import type { MusicConfig } from "~/api/player";
import { streamUrl, type Release, type Track } from "~/utils/monochrome";
import { trackPath } from "~/utils/paths";

/** A 26 MB FLAC over a slow link still has to arrive. */
const TIMEOUT_MS = 180_000;

type File = { url: string; path: string };

function filesOf(release: Release, config: MusicConfig): File[] {
  return release.tracks.map((track) => ({
    url: streamUrl(track.id),
    path: trackPath(track, config.downloadDir, release.title),
  }));
}

/** The catalog serves the whole file in one reply, so this is one request per track. */
async function save(file: File): Promise<boolean> {
  if (existsSync(file.path) && statSync(file.path).size > 0) return false;

  const response = await fetch(file.url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`The catalog answered ${response.status} for ${file.url}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0) throw new Error(`The catalog sent no audio for ${file.url}`);

  mkdirSync(dirname(file.path), { recursive: true });
  writeFileSync(file.path, bytes);
  return true;
}

async function saveAll(files: File[], config: MusicConfig, title: string): Promise<void> {
  if (files.length === 0) throw new Error(`${title} has no playable tracks`);

  const toast = await showToast({
    style: Toast.Style.Animated,
    title: `Downloading ${title}`,
    message: `0 / ${files.length}`,
  });

  let saved = 0;
  for (const [index, file] of files.entries()) {
    if (await save(file)) saved += 1;
    const name = file.path.slice(file.path.lastIndexOf("/") + 1);
    toast.message = `${index + 1} / ${files.length} · ${name}`;
    await toast.update();
  }

  toast.style = Toast.Style.Success;
  toast.title = saved === 0 ? "Already downloaded" : `Downloaded ${saved} tracks`;
  toast.message = config.downloadDir;
  await toast.update();
}

export function downloadTrack(track: Track, config: MusicConfig, album?: string): void {
  void attempt("Could not download the track", () =>
    saveAll([{ url: streamUrl(track.id), path: trackPath(track, config.downloadDir, album) }], config, track.title),
  );
}

export function downloadRelease(releaseId: string, config: MusicConfig): void {
  void attempt("Could not download the album", async () => {
    const release = await releaseTracks(releaseId);
    await saveAll(filesOf(release, config), config, release.title);
  });
}

/** Every album, EP and single the artist page lists, one release at a time. */
export function downloadDiscography(artistId: string, config: MusicConfig): void {
  void attempt("Could not download the discography", async () => {
    const page = await fetchArtist(artistId);
    const releases = [...page.albums, ...page.singles, ...page.compilations];
    if (releases.length === 0) throw new Error(`${page.name} has no releases to download`);

    const toast = await showToast({
      style: Toast.Style.Animated,
      title: `Reading ${page.name}'s releases`,
      message: `0 / ${releases.length}`,
    });

    const files: File[] = [];
    for (const [index, summary] of releases.entries()) {
      files.push(...filesOf(await releaseTracks(summary.id), config));
      toast.message = `${index + 1} / ${releases.length} · ${summary.title}`;
      await toast.update();
    }

    await saveAll(files, config, `${page.name} discography`);
  });
}
