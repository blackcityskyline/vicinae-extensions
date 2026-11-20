import { mkdir, writeFile } from "node:fs/promises";
import * as path from "node:path";

import {
  apiErrorMessage,
  fileName,
  formatFromContentType,
  parseCatalog,
  type Catalog,
  type Format,
} from "~/utils/snippet";

const ORIGIN = "https://codetoimage.com";

type Ok<T> = { result: T; error?: undefined };
type Fail = { result?: undefined; error: Error };
export type Result<T> = Ok<T> | Fail;

export async function fetchCatalog(): Promise<Result<Catalog>> {
  let response: Response;
  try {
    response = await fetch(`${ORIGIN}/api/options.json`, {
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    return { error: new Error(`Cannot reach codetoimage.com: ${(error as Error).message}`) };
  }
  if (!response.ok) {
    return { error: new Error(`codetoimage.com answered HTTP ${response.status} for its options`) };
  }

  const parsed = parseCatalog(await response.text());
  if (!parsed) {
    return {
      error: new Error(
        "codetoimage.com returned options this extension does not understand. Open codetoimage.com to check the service.",
      ),
    };
  }
  return { result: parsed };
}

export type RenderInput = {
  code: string;
  language: string;
  theme: string;
  format: Format;
  lineNumbers: boolean;
  windowChrome: boolean;
  folder: string;
};

export async function renderImage(input: RenderInput): Promise<Result<string>> {
  const body = {
    code: input.code,
    language: input.language,
    theme: input.theme,
    format: input.format,
    scale: 2,
    lineNumbers: input.lineNumbers,
    windowChrome: input.windowChrome ? "macos" : "none",
    windowTitle: "Snippet",
  };

  let response: Response;
  try {
    response = await fetch(`${ORIGIN}/api/image`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "image/png,image/svg+xml" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (error) {
    return { error: new Error(`Cannot reach codetoimage.com: ${(error as Error).message}`) };
  }

  if (!response.ok) {
    return {
      error: new Error(apiErrorMessage(response.status, await response.text())),
    };
  }

  const format = formatFromContentType(response.headers.get("content-type"));
  if (!format) {
    return {
      error: new Error("codetoimage.com answered with something that is not a PNG or SVG image."),
    };
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0) {
    return { error: new Error("codetoimage.com returned an empty image.") };
  }

  const target = path.join(input.folder, fileName(new Date(), format));
  try {
    await mkdir(input.folder, { recursive: true });
    await writeFile(target, bytes);
  } catch (error) {
    return { error: new Error(`Cannot write ${target}: ${(error as Error).message}`) };
  }
  return { result: target };
}
