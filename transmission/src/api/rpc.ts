/**
 * The daemon's RPC, measured on transmission-daemon 4.1.4 (rpc-version 19):
 *
 * - one endpoint, `POST /transmission/rpc`, JSON in, JSON out
 * - no session header → `409` whose `X-Transmission-Session-Id` must be replayed
 * - `result: "success"` is not proof of anything: `torrent-add` answers success for
 *   an all-zero hash, so callers re-read the list instead of trusting it
 * - HTTP Basic only when the daemon was started with `--auth`
 *
 * No dependency does this better: the wrapper upstream uses hides the 409, and the
 * handshake is the error path the extension needs anyway.
 */

export type Connection = {
  host: string;
  port: string;
  ssl: boolean;
  username: string;
  password: string;
};

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export class RpcError extends Error {}

/** The fields the views read, selected by name so the payload stays small. */
const FIELDS = [
  "id",
  "name",
  "hashString",
  "status",
  "totalSize",
  "sizeWhenDone",
  "leftUntilDone",
  "percentDone",
  "rateDownload",
  "rateUpload",
  "uploadRatio",
  "eta",
  "error",
  "errorString",
  "downloadDir",
  "addedDate",
  "magnetLink",
  "files",
  "trackers",
  "trackerStats",
  "pieceCount",
  "pieceSize",
  "isPrivate",
  "creator",
  "comment",
  "dateCreated",
  "bandwidthPriority",
  "downloadLimited",
  "downloadLimit",
  "uploadLimited",
  "uploadLimit",
] as const;

/** `torrent-get` returns these three by the same names, all in the same array. */
export type TorrentFile = {
  name: string;
  length: number;
  bytesCompleted: number;
};

export type Tracker = {
  announce: string;
  tier: number;
};

export type TrackerStat = {
  host: string;
  announce: string;
  lastAnnounceTime: number;
  lastScrapeTime: number;
  seederCount: number;
  leecherCount: number;
  downloadCount: number;
};

export type Torrent = {
  id: number;
  name: string;
  hashString: string;
  status: number;
  totalSize: number;
  sizeWhenDone: number;
  leftUntilDone: number;
  percentDone: number;
  rateDownload: number;
  rateUpload: number;
  uploadRatio: number;
  eta: number;
  error: number;
  errorString: string;
  downloadDir: string;
  addedDate: number;
  magnetLink: string;
  files: TorrentFile[];
  trackers: Tracker[];
  trackerStats: TrackerStat[];
  pieceCount: number;
  pieceSize: number;
  isPrivate: boolean;
  creator: string;
  comment: string;
  dateCreated: number;
  bandwidthPriority: number;
  downloadLimited: boolean;
  downloadLimit: number;
  uploadLimited: boolean;
  uploadLimit: number;
};

export type SessionSettings = {
  "download-dir": string;
  "peer-port": number;
  "speed-limit-down": number;
  "speed-limit-up": number;
  version: string;
};

export function rpcUrl(connection: Connection): string {
  const host = connection.host.trim() || "localhost";
  const port = connection.port.trim() || "9091";
  return `${connection.ssl ? "https" : "http"}://${host}:${port}/transmission/rpc`;
}

/** The web interface the daemon serves on the same port. */
export function webUrl(connection: Connection): string {
  const host = connection.host.trim() || "localhost";
  const port = connection.port.trim() || "9091";
  return `${connection.ssl ? "https" : "http"}://${host}:${port}/transmission/web/`;
}

export function authHeader(connection: Connection): Record<string, string> {
  if (connection.username === "") return {};
  const pair = `${connection.username}:${connection.password}`;
  return { authorization: `Basic ${Buffer.from(pair, "utf8").toString("base64")}` };
}

export type Client = {
  url: string;
  call: <T>(method: string, args?: Record<string, unknown>) => Promise<T>;
};

const SESSION_HEADER = "x-transmission-session-id";

/**
 * One client per connection. `send` is injected so the handshake can be tested
 * without a daemon.
 */
export function makeClient(connection: Connection, send: FetchLike = (input, init) => fetch(input, init)): Client {
  const url = rpcUrl(connection);
  let session: string | undefined;

  async function call<T>(method: string, args?: Record<string, unknown>): Promise<T> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let response: Response;
      try {
        response = await send(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...authHeader(connection),
            ...(session === undefined ? {} : { [SESSION_HEADER]: session }),
          },
          body: JSON.stringify(args === undefined ? { method } : { method, arguments: args }),
        });
      } catch {
        throw new RpcError(`Could not reach ${url}. Is the daemon running?`);
      }

      if (response.status === 409) {
        const next = response.headers.get(SESSION_HEADER);
        if (next === null || next === session) throw new RpcError("The daemon rejected the session header twice.");
        session = next;
        continue;
      }
      if (response.status === 401) {
        throw new RpcError("The daemon rejected the username or password.");
      }
      if (!response.ok) {
        throw new RpcError(`The daemon answered ${response.status} for ${method}.`);
      }

      const body = (await response.json()) as { result?: string; arguments?: T };
      if (body.result !== "success") {
        throw new RpcError(`${method} failed: ${body.result ?? "no result"}`);
      }
      return body.arguments as T;
    }

    throw new RpcError("The daemon kept asking for a new session header.");
  }

  return { url, call };
}

export function torrents(client: Client): Promise<{ torrents: Torrent[] }> {
  return client.call<{ torrents: Torrent[] }>("torrent-get", { fields: FIELDS });
}

export function session(client: Client): Promise<SessionSettings> {
  return client.call<SessionSettings>("session-get");
}

/**
 * Start or stop; the daemon takes a list in one call, and no `ids` at all means
 * every torrent — which is what "Resume All" uses.
 */
export function setStopped(client: Client, ids: number[] | undefined, stopped: boolean): Promise<unknown> {
  return client.call(stopped ? "torrent-stop" : "torrent-start", ids === undefined ? undefined : { ids });
}

/** `torrent-set` takes the ids plus whichever fields changed; one call per form submit. */
export function configure(client: Client, id: number, values: Record<string, unknown>): Promise<unknown> {
  return client.call("torrent-set", { ids: [id], ...values });
}

export function remove(client: Client, ids: number[], deleteData: boolean): Promise<unknown> {
  return client.call("torrent-remove", { ids, "delete-local-data": deleteData });
}

/**
 * `torrent-add` answers success for a link the daemon cannot use, so the caller
 * has to look at the list afterwards. This wrapper does the looking.
 */
export async function add(client: Client, link: string, downloadDir?: string): Promise<Torrent | undefined> {
  const hash = /xt=urn:btih:([a-z0-9]+)/i.exec(link)?.[1]?.toLowerCase();
  const args: Record<string, unknown> = { filename: link };
  if (downloadDir !== undefined && downloadDir !== "") args["download-dir"] = downloadDir;

  await client.call("torrent-add", args);
  const { torrents: after } = await torrents(client);
  return after.find((torrent) => hash === undefined || torrent.hashString.toLowerCase() === hash);
}
