import assert from "node:assert/strict";

import {
  convert,
  isSupportedLink,
  normalizeInstance,
  serviceLabel,
  typeLabel,
  usableLinks,
  type Conversion,
} from "../src/api/idhs.ts";

/**
 * The self-check.
 *
 * The success fixture is the body a locally built instance answered on 2026-11-13; the link
 * patterns are upstream's `src/config/constants.ts` at `e65bca2`. `docs/audits/idonthavespotify.md`
 * records both.
 */

const SUCCESS = JSON.stringify({
  id: "b3Blbi5zcG90aWZ5LmNvbS90cmFjay8zQWhYWmE4c1VRaHQwVUVkQkpncEdj",
  type: "song",
  title: "Like a Rolling Stone",
  description: "Bob Dylan · Song · 1965",
  image: "https://image-cdn-fa.spotifycdn.com/image/ab67616d0000b2730cb0884829c5503b2e242541",
  audio: "https://p.scdn.co/mp3-preview/62c229b1cadd22b991df9aeaedd38e873ddaccbe",
  source: "https://open.spotify.com/track/3AhXZa8sUQht0UEdBJgpGc",
  universalLink: "http://localhost:3000?id=b3Blbi5zcG90aWZ5LmNvbS90cmFjay8zQWhYWmE4c1VRaHQwVUVkQkpncEdj",
  links: [
    { type: "appleMusic", url: "https://geo.music.apple.com/ca/album/like-a-rolling-stone/192688369?i=192688675", isVerified: true, notAvailable: false },
    { type: "deezer", url: "https://www.deezer.com/track/14477354", isVerified: true, notAvailable: false },
    { type: "soundCloud", url: "https://soundcloud.com/the-bob-dylan-experience/like-a-rolling-stone-1", isVerified: true, notAvailable: false },
    { type: "spotify", url: "https://open.spotify.com/track/low-confidence", notAvailable: true },
    { type: "tidal", url: "" },
  ],
});

const CHALLENGE = "<!doctype html><html><head><title>Just a moment...</title></head><body>Enable JavaScript and cookies to continue</body></html>";

let passed = 0;
let failed = 0;

async function check(name: string, body: () => Promise<void> | void): Promise<void> {
  try {
    await body();
    passed += 1;
    console.log(`ok   ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}\n  ${(error as Error).message}`);
  }
}

type Answer = { status?: number; body: string; contentType?: string };
type Call = { url: string; init: RequestInit | undefined };

async function withFetch<T>(handler: (call: Call) => Answer, body: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const answer = handler({ url: String(input), init });
    return new Response(answer.body, {
      status: answer.status ?? 200,
      headers: { "content-type": answer.contentType ?? "application/json" },
    });
  }) as typeof fetch;
  try {
    return await body();
  } finally {
    globalThis.fetch = original;
  }
}

async function main() {
  await check("every source upstream parses is accepted", () => {
    const accepted = [
      "https://open.spotify.com/track/3AhXZa8sUQht0UEdBJgpGc",
      "https://open.spotify.com/intl-de/album/1DFixLWuPkv3KT3TnV35m3",
      "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M",
      "https://spotify.link/abcDEF12345",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtu.be/dQw4w9WgXcQ",
      "https://music.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://music.apple.com/ca/album/like-a-rolling-stone/192688369?i=192688675",
      "https://www.deezer.com/track/14477354",
      "https://soundcloud.com/the-bob-dylan-experience/like-a-rolling-stone-1",
      "https://tidal.com/browse/track/12345678",
      "https://open.qobuz.com/track/12345678",
      "https://bobdylan.bandcamp.com/album/highway-61-revisited",
      "https://www.pandora.com/artist/bob-dylan/like-a-rolling-stone/TR:12345",
      "https://www.jiosaavn.com/song/like-a-rolling-stone/ABC123",
      "https://podcasts.apple.com/us/podcast/foo/id123456?i=1000600000000",
      "https://share.google/abc123",
    ];
    for (const link of accepted) assert.ok(isSupportedLink(link), `refused ${link}`);
  });

  await check("http, plain text and an unknown host are refused locally", () => {
    const refused = [
      "",
      "nonsense",
      "http://open.spotify.com/track/3AhXZa8sUQht0UEdBJgpGc",
      "https://example.com/track/3AhXZa8sUQht0UEdBJgpGc",
      "spotify:track:3AhXZa8sUQht0UEdBJgpGc",
      "https://open.spotify.com/show/short",
    ];
    for (const link of refused) assert.equal(isSupportedLink(link), false, `accepted ${link}`);
  });

  await check("an instance URL gets a scheme and loses trailing slashes", () => {
    assert.equal(normalizeInstance(" https://idhs.example.com/ "), "https://idhs.example.com");
    assert.equal(normalizeInstance("idhs.example.com///"), "https://idhs.example.com");
    assert.equal(normalizeInstance("http://localhost:3000/"), "http://localhost:3000");
    assert.equal(normalizeInstance(""), "");
  });

  await check("a conversion drops unusable destinations and keeps the rest in order", () => {
    const conversion = JSON.parse(SUCCESS) as Conversion;
    const rows = usableLinks(conversion);
    assert.deepEqual(
      rows.map((row) => row.type),
      ["appleMusic", "deezer", "soundCloud"],
      "notAvailable and empty-URL rows are gone",
    );
    assert.equal(serviceLabel("youTube"), "YouTube Music");
    assert.equal(serviceLabel("podcastFeed"), "Podcast RSS");
    assert.equal(serviceLabel("elsewhere"), "elsewhere");
    assert.equal(typeLabel("song"), "Song");
    assert.equal(typeLabel("show"), "Show");
  });

  await check("the request is one POST with the link, and the body is read back whole", async () => {
    await withFetch(
      () => ({ body: SUCCESS }),
      async () => {
        const conversion = await convert("https://idhs.example.com/", "https://open.spotify.com/track/3AhXZa8sUQht0UEdBJgpGc");
        assert.equal(conversion.title, "Like a Rolling Stone");
        assert.equal(conversion.description, "Bob Dylan · Song · 1965");
        assert.equal(conversion.audio, "https://p.scdn.co/mp3-preview/62c229b1cadd22b991df9aeaedd38e873ddaccbe");
        assert.equal(conversion.links.length, 5);
      },
    );
  });

  await check("the POST carries the link as JSON to /api/search?v=1", async () => {
    let seen: Call | undefined;
    await withFetch(
      (call) => {
        seen = call;
        return { body: SUCCESS };
      },
      async () => {
        await convert("https://idhs.example.com/", "https://open.spotify.com/track/3AhXZa8sUQht0UEdBJgpGc");
      },
    );
    assert.ok(seen);
    assert.equal(seen.url, "https://idhs.example.com/api/search?v=1");
    assert.equal(seen.init?.method, "POST");
    assert.deepEqual(JSON.parse(String(seen.init?.body)), { link: "https://open.spotify.com/track/3AhXZa8sUQht0UEdBJgpGc" });
    assert.equal((seen.init?.headers as Record<string, string>)["content-type"], "application/json");
  });

  await check("a Cloudflare challenge is named as a 403, not parsed as a conversion", async () => {
    await withFetch(
      () => ({ status: 403, body: CHALLENGE, contentType: "text/html; charset=UTF-8" }),
      async () => {
        await assert.rejects(() => convert("https://idonthavespotify.sjdonado.com", "https://open.spotify.com/track/3AhXZa8sUQht0UEdBJgpGc"), /denied programmatic search \(403\)/);
      },
    );
  });

  await check("the instance's own 400 is translated out of its internal name", async () => {
    await withFetch(
      () => ({ status: 400, body: '{"error":"Invalid link, please check ALLOWED_LINKS_REGEX"}' }),
      async () => {
        await assert.rejects(() => convert("https://idhs.example.com", "https://open.spotify.com/track/3AhXZa8sUQht0UEdBJgpGc"), /does not recognise that link/);
      },
    );
  });

  await check("a 500 keeps the instance's reason, and a non-conversion is caught", async () => {
    await withFetch(
      () => ({ status: 500, body: '{"error":"API key not valid. Please pass a valid API key."}' }),
      async () => {
        await assert.rejects(() => convert("https://idhs.example.com", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"), /API key not valid/);
      },
    );
    await withFetch(
      () => ({ body: '{"id":"x"}' }),
      async () => {
        await assert.rejects(() => convert("https://idhs.example.com", "https://open.spotify.com/track/3AhXZa8sUQht0UEdBJgpGc"), /not a conversion/);
      },
    );
    await withFetch(
      () => ({ body: "" }),
      async () => {
        await assert.rejects(() => convert("", "https://open.spotify.com/track/3AhXZa8sUQht0UEdBJgpGc"), /no instance URL/);
      },
    );
  });

  console.log(failed === 0 ? `\nall ${passed} checks passed` : `\n${failed} check(s) failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
