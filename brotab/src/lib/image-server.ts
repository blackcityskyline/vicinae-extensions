import { readFile } from "node:fs/promises";
import { createServer } from "node:http";

/**
 * Vicinae's markdown renderer loads images over HTTP and nothing else: a
 * `file://` URI or a bare path renders as nothing at all (measured against
 * v0.30.0 — an http image of the same file draws, three local forms do not).
 * The screenshot is written to the cache directory, so the preview serves that
 * one file from a loopback port for as long as the view is open.
 *
 * Paths are never taken from the request: the URL carries an opaque token and
 * only the files registered here are readable.
 */
export type ImageServer = {
  /** A URL for the file; every call gets a fresh token, which busts the cache. */
  urlFor(file: string): string;
  close(): void;
};

export async function startImageServer(): Promise<ImageServer> {
  const files = new Map<string, string>();

  const server = createServer((request, response) => {
    const token = (request.url ?? "").split("/").pop() ?? "";
    const file = files.get(token);
    if (file === undefined) {
      response.writeHead(404).end();
      return;
    }
    readFile(file).then(
      (body) => response.writeHead(200, { "content-type": "image/png" }).end(body),
      () => response.writeHead(500).end(),
    );
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  const port = address === null || typeof address === "string" ? 0 : address.port;

  return {
    urlFor(file) {
      const token = `${files.size}-${Date.now()}.png`;
      files.set(token, file);
      return `http://127.0.0.1:${port}/${token}`;
    },
    close() {
      server.close();
    },
  };
}
