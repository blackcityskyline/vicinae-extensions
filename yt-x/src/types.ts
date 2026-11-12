export type Thumbnail = {
  url: string;
  width?: number;
  height?: number;
};

/**
 * One row of any yt-dlp listing or yt-x state file: a video, a channel or a
 * playlist. The fields a channel or playlist entry does not carry stay absent.
 */
export type Entry = {
  id: string;
  title: string;
  url: string;
  thumbnails?: Thumbnail[];
  channel?: string;
  duration?: number | null;
  channelUrl?: string;
  channelId?: string;
  /** `view_count`, absent on live streams and on some flat listings. */
  viewCount?: number;
  /** `concurrent_view_count`, only on a live stream. */
  concurrentViewCount?: number;
  /** `live_status`: `is_live`, `was_live`, `is_upcoming`. */
  liveStatus?: string;
  /** `timestamp` or `release_timestamp`, in seconds since the epoch. */
  publishedAt?: number;
  /** `channel_follower_count`, on a channel rather than on its videos. */
  followerCount?: number;
  /** `description`, which a channel listing carries at the top level. */
  description?: string;
};

export type Playlist = {
  name: string;
  url: string;
};

/** `my/cmds.json`: a URL yt-x lists with extra yt-dlp options. */
export type CustomCommand = {
  name: string;
  url: string;
  opts: string[];
};

/** The parts of yt-x's config and layout the extension acts on. */
export type Config = {
  player: string;
  playerArgs: string[];
  ytDlpOpts: string[];
  downloadDir: string;
  cookiesBrowser: string;
  perPage: number;
  editor: string;
  noOfRecent: number;
  enumerateDownloads: boolean;
  searchHistory: boolean;
  /** `Play` starts the related list too; the preference in the manifest sets it. */
  upNext: boolean;
  /** `$XDG_CONFIG_HOME`. */
  configHome: string;
  /** `$XDG_CONFIG_HOME/yt-x`. */
  configDir: string;
  /** `$XDG_CACHE_HOME/yt-x`. */
  cacheDir: string;
};
