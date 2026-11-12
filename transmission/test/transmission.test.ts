import assert from "node:assert/strict";

import { add, authHeader, makeClient, RpcError, rpcUrl, webUrl, type Client, type FetchLike } from "../src/api/rpc.ts";
import { bytes, eta, percent, ratio, speed, statusLabel } from "../src/utils/format.ts";
import { looksLikeTorrent } from "../src/utils/torrent.ts";

let passed = 0;
let failed = 0;

async function check(name: string, body: () => void | Promise<void>): Promise<void> {
  try {
    await body();
    passed++;
    console.log(`ok   ${name}`);
  } catch (error) {
    failed++;
    console.log(`FAIL ${name}: ${(error as Error).message}`);
  }
}

const CONNECTION = { host: "localhost", port: "9091", ssl: false, username: "", password: "" };

/** Answers in order, and records what each request carried. */
function stubFetch(answers: Array<Response | Error>): { send: FetchLike; headers: Headers[] } {
  const headers: Headers[] = [];
  let index = 0;
  const send: FetchLike = (_input, init) => {
    headers.push(new Headers(init.headers));
    const answer = answers[index];
    index += 1;
    if (answer === undefined) throw new Error("stub ran out of answers");
    if (answer instanceof Error) return Promise.reject(answer);
    return Promise.resolve(answer);
  };
  return { send, headers };
}

function ok(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

function conflict(session: string): Response {
  return new Response("", { status: 409, headers: { "x-transmission-session-id": session } });
}

async function main(): Promise<void> {
  await check("bytes counts in binary units, and says so", () => {
    assert.equal(bytes(0), "0 B");
    assert.equal(bytes(1023), "1023 B");
    assert.equal(bytes(1536), "1.5 KB");
    assert.equal(bytes(200 * 1024), "200 KB");
    assert.equal(bytes(1024 ** 3 * 2.5), "2.5 GB");
    assert.equal(bytes(-1), "—");
    assert.equal(bytes(Number.NaN), "—");
  });

  await check("a speed of zero reads as nothing moving, not as 0 B/s", () => {
    assert.equal(speed(0), "—");
    assert.equal(speed(-5), "—");
    assert.equal(speed(1536), "1.5 KB/s");
  });

  await check("eta stops at the last useful unit", () => {
    assert.equal(eta(0), "—");
    assert.equal(eta(-1), "—");
    assert.equal(eta(45), "45s");
    assert.equal(eta(90), "1m 30s");
    assert.equal(eta(3661), "1h 1m");
    assert.equal(eta(90_000), "1d 1h");
  });

  await check("progress is a fraction in, a percentage out", () => {
    assert.equal(percent(0), "0%");
    assert.equal(percent(0.425), "43%");
    assert.equal(percent(1), "100%");
    assert.equal(percent(1.2), "100%");
    assert.equal(percent(Number.NaN), "—");
  });

  await check("a negative ratio is the RPC's way of saying there is none", () => {
    assert.equal(ratio(-1), "—");
    assert.equal(ratio(0), "0.00");
    assert.equal(ratio(1.234), "1.23");
  });

  await check("status codes read as words, and a finished stopped torrent is Completed", () => {
    assert.equal(statusLabel(0, 0.5), "Stopped");
    assert.equal(statusLabel(0, 1), "Completed");
    assert.equal(statusLabel(4, 0.5), "Downloading");
    assert.equal(statusLabel(6, 1), "Seeding");
    assert.equal(statusLabel(9, 0), "Unknown (9)");
  });

  await check("only a magnet, a .torrent link or a .torrent path is prefilled from the clipboard", () => {
    assert.equal(looksLikeTorrent("magnet:?xt=urn:btih:abc"), true);
    assert.equal(looksLikeTorrent("https://example.org/a.torrent"), true);
    assert.equal(looksLikeTorrent("https://example.org/a.torrent?x=1"), true);
    assert.equal(looksLikeTorrent("/home/me/a.torrent"), true);
    assert.equal(looksLikeTorrent("  magnet:?xt=urn:btih:abc  "), true);
    assert.equal(looksLikeTorrent("hello"), false);
    assert.equal(looksLikeTorrent(""), false);
    assert.equal(looksLikeTorrent("magnet:?xt=urn:btih:a\nhttps://example.org/a.torrent"), false);
  });

  await check("the URL follows ssl and the stored port", () => {
    assert.equal(rpcUrl(CONNECTION), "http://localhost:9091/transmission/rpc");
    assert.equal(
      rpcUrl({ ...CONNECTION, ssl: true, host: "seedbox", port: "443" }),
      "https://seedbox:443/transmission/rpc",
    );
    assert.equal(rpcUrl({ ...CONNECTION, host: "  ", port: "  " }), "http://localhost:9091/transmission/rpc");
    assert.equal(webUrl(CONNECTION), "http://localhost:9091/transmission/web/");
  });

  await check("no username means no Authorization header at all", () => {
    assert.deepEqual(authHeader(CONNECTION), {});
    assert.deepEqual(authHeader({ ...CONNECTION, username: "u", password: "p" }), { authorization: "Basic dTpw" });
  });

  await check("the 409 handshake is replayed once and then remembered", async () => {
    const stub = stubFetch([
      conflict("first"),
      ok({ result: "success", arguments: { version: "4.1.4" } }),
      ok({ result: "success", arguments: { torrents: [] } }),
    ]);
    const client = makeClient(CONNECTION, stub.send);

    const settings = await client.call<{ version: string }>("session-get");
    assert.equal(settings.version, "4.1.4");
    assert.equal(stub.headers[0]?.has("x-transmission-session-id"), false);
    assert.equal(stub.headers[1]?.get("x-transmission-session-id"), "first");

    await client.call("torrent-get", { fields: ["id"] });
    assert.equal(stub.headers[2]?.get("x-transmission-session-id"), "first");
  });

  await check("a daemon that never issues a new session is an error, not a loop", async () => {
    const stub = stubFetch([conflict("same"), conflict("same")]);
    const client = makeClient(CONNECTION, stub.send);
    await assert.rejects(() => client.call("session-get"), RpcError);
  });

  await check("an unreachable daemon says so instead of hanging on a raw fetch error", async () => {
    const stub = stubFetch([new Error("ECONNREFUSED")]);
    const client = makeClient(CONNECTION, stub.send);
    await assert.rejects(
      () => client.call("session-get"),
      (error: Error) => error instanceof RpcError && error.message.includes("Is the daemon running?"),
    );
  });

  await check("a rejected password and a server error are told apart", async () => {
    const unauthorized = makeClient(CONNECTION, stubFetch([new Response("", { status: 401 })]).send);
    await assert.rejects(() => unauthorized.call("session-get"), /username or password/);

    const broken = makeClient(CONNECTION, stubFetch([new Response("", { status: 500 })]).send);
    await assert.rejects(() => broken.call("session-get"), /answered 500/);
  });

  await check("a non-success result is an error even with status 200", async () => {
    const client = makeClient(CONNECTION, stubFetch([ok({ result: "invalid argument" })]).send);
    await assert.rejects(() => client.call("torrent-add"), /invalid argument/);
  });

  await check("an add that the daemon accepted but did not list is reported as not added", async () => {
    const calls: string[] = [];
    const client: Client = {
      url: "http://localhost:9091/transmission/rpc",
      call: async <T>(method: string): Promise<T> => {
        calls.push(method);
        return (method === "torrent-get" ? { torrents: [] } : {}) as T;
      },
    };

    const torrent = await add(client, "magnet:?xt=urn:btih:0000000000000000000000000000000000000000");
    assert.equal(torrent, undefined);
    assert.deepEqual(calls, ["torrent-add", "torrent-get"]);
  });

  await check("an add is found by its hash, not by the daemon's word", async () => {
    const hash = "abcdefabcdefabcdefabcdefabcdefabcdefabcd";
    const listed = [
      { id: 1, name: "other", hashString: "1111111111111111111111111111111111111111" },
      { id: 2, name: "wanted", hashString: hash.toUpperCase() },
    ];
    const client: Client = {
      url: "http://localhost:9091/transmission/rpc",
      call: async <T>(method: string): Promise<T> =>
        (method === "torrent-get" ? { torrents: listed } : {}) as T,
    };

    const torrent = await add(client, `magnet:?xt=urn:btih:${hash}`);
    assert.equal(torrent?.id, 2);
  });

  console.log(failed === 0 ? `\n${passed} passed` : `\n${failed} check(s) failed`);
  process.exit(failed === 0 ? 0 : 1);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
