/**
 * The HTTP half of the Raycast extension: one POST to the owner's instance.
 *
 * The public instance refuses programmatic search — measured as a Cloudflare 403 challenge from
 * `https://idonthavespotify.sjdonado.com/api/search` with every user agent — so the base URL is a
 * required preference and this module never guesses a default. Nothing here imports
 * `@vicinae/api`; the tests drive it with a stubbed `fetch`.
 */

export type Destination = {
  type: string;
  url: string;
  isVerified?: boolean;
  notAvailable?: boolean;
};

export type Conversion = {
  id: string;
  type: string;
  title: string;
  description: string;
  image?: string;
  audio?: string;
  source: string;
  universalLink: string;
  links: Destination[];
};

/**
 * The sources upstream parses, copied from `src/config/constants.ts` at `e65bca2`, so a link is
 * refused here rather than by a request that would spend a second to say the same thing.
 */
const SOURCES = [
  /^https:\/\/(open\.spotify\.com\/(?:intl-[a-z]{2}\/)?(track|album|playlist|artist|episode|show)|spotify\.link)\/(\w{11,24})(?:[?#].*)?$/,
  /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be|music\.youtube\.com)\/(?:watch\?v=|embed\/|v\/|shorts\/|playlist\?list=|channel\/)?([^&\s]{11,})/,
  /^https:\/\/(?:geo\.)?music\.apple\.com\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(?:album|playlist|station|artist|music-video|video-playlist|show|song)\/([^/?]+)(?:\/([^/?]+))?(?:\?.*)?$/,
  /^https:\/\/www\.deezer\.com\/(?:[a-z]{2}\/)?(?:track|album|playlist|artist|episode|show)\/(\d+)/,
  /^(?:https:\/\/soundcloud\.com\/([\w-]+)\/([\w-]+)(?:\/sets\/([\w-]+))?(?:[?#].*)?|https:\/\/on\.soundcloud\.com\/([\w-]{8,}))$/,
  /^https:\/\/tidal\.com\/browse\/(track|artist|album|mix|video)\/([\w-]+)(?:\/[\w-]+)?(?:[?#].*)?$/,
  /^https:\/\/(?:www\.google\.com\/gasearch(?:[?#].+)?|share\.google\/(.+))$/,
  /^https:\/\/(open|play|www)\.qobuz\.com\/(\w{2}-\w{2}\/)?(artist|album|interpreter|track)\/([\w-]+\/)?(\w+)$/,
  /^https:\/\/([^.]+)\.bandcamp\.com\/(album|track)?\/?([^/?]+)?\/?$/,
  /^https:\/\/(?:www\.)?pandora\.com\/(playlist|podcast|artist)\/(?:[^/]+\/)?([^/]+\/)?(?:[^/]+\/)?((?:AL|AR|TR|PC|PE).+)\/?$/,
  /^https:\/\/(?:www\.)?jiosaavn\.com\/(song|album|artist|featured|playlist)\/([^/?#]+)\/([^/?#]+)\/?(?:[?#].*)?$/,
  /^https:\/\/podcasts\.apple\.com\/(?:[a-z]{2}\/)?podcast(?:\/[^/?#]+)?\/id(\d+)\/?((?:[?#].*)?)$/,
];

export function isSupportedLink(link: string): boolean {
  return SOURCES.some((pattern) => pattern.test(link));
}

/** A base URL with a scheme and no trailing slash; `idhs.example.com` is a common paste. */
export function normalizeInstance(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withScheme.replace(/\/+$/, "");
}

const SERVICES: Record<string, string> = {
  spotify: "Spotify",
  youTube: "YouTube Music",
  appleMusic: "Apple Music",
  deezer: "Deezer",
  soundCloud: "SoundCloud",
  tidal: "Tidal",
  qobuz: "Qobuz",
  bandcamp: "Bandcamp",
  pandora: "Pandora",
  jiosaavn: "JioSaavn",
  applePodcasts: "Apple Podcasts",
  podcastFeed: "Podcast RSS",
  invidious: "Invidious",
};

const TYPES: Record<string, string> = {
  song: "Song",
  album: "Album",
  playlist: "Playlist",
  artist: "Artist",
  podcast: "Podcast",
  episode: "Episode",
  show: "Show",
  mix: "Mix",
};

export const serviceLabel = (type: string): string => SERVICES[type] ?? type;
export const typeLabel = (type: string): string => TYPES[type] ?? type;

/** The destinations worth a row: a URL, and not the instance's own low-confidence guess. */
export function usableLinks(conversion: Conversion): Destination[] {
  return conversion.links.filter((link) => !link.notAvailable && typeof link.url === "string" && link.url !== "");
}

function parse(raw: string): Conversion | null {
  try {
    const body = JSON.parse(raw) as Partial<Conversion>;
    if (!body || typeof body !== "object" || typeof body.title !== "string" || !Array.isArray(body.links)) return null;
    return {
      id: String(body.id ?? ""),
      type: String(body.type ?? ""),
      title: body.title,
      description: String(body.description ?? ""),
      image: typeof body.image === "string" ? body.image : undefined,
      audio: typeof body.audio === "string" ? body.audio : undefined,
      source: String(body.source ?? ""),
      universalLink: String(body.universalLink ?? ""),
      links: body.links as Destination[],
    };
  } catch {
    return null;
  }
}

/**
 * The instance's error text, translated where the API speaks to itself.
 *
 * `400 Invalid link, please check ALLOWED_LINKS_REGEX` is upstream's own message; the other two
 * cases are what this extension actually meets: a page instead of JSON (Cloudflare in front of the
 * public instance) and `DISABLE_API_SEARCH`.
 */
function explain(status: number, body: string, contentType: string): string {
  const json = (() => {
    try {
      return JSON.parse(body) as { error?: string };
    } catch {
      return undefined;
    }
  })();
  const message = json?.error ?? "";
  if (status === 403) return `the instance denied programmatic search (403); set DISABLE_API_SEARCH=false or use another instance`;
  if (message.includes("ALLOWED_LINKS_REGEX")) return "the instance does not recognise that link";
  if (message) return message;
  if (contentType.includes("text/html")) return `the instance answered with a web page (${status}), not the API`;
  return `the instance answered ${status}`;
}

export async function convert(instanceUrl: string, link: string): Promise<Conversion> {
  const base = normalizeInstance(instanceUrl);
  if (!base) throw new Error("no instance URL is configured");
  const response = await fetch(`${base}/api/search?v=1`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ link }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(explain(response.status, body, response.headers.get("content-type") ?? ""));
  const conversion = parse(body);
  if (!conversion) throw new Error("the instance sent something that is not a conversion");
  return conversion;
}
