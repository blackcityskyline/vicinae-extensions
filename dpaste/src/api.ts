/**
 * dpaste.com API v2, measured 2026-10-22: POST returns 201, the item URL in the
 * `Location` header and in the body. No account, no key, one paste per second.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getCACertificates, setDefaultCACertificates } from "node:tls";

const ENDPOINT = "https://dpaste.com/api/v2/";

/** The site allows one request per second; a hung one must not hang the form. */
const TIMEOUT_MS = 15_000;

/**
 * dpaste chains to Let's Encrypt's 2025 root "ISRG Root YR", which Node still
 * omits from its bundled store, so an untouched install fails before the request
 * leaves. The root ships as an asset and joins this worker's defaults: no system
 * trust-store change, no environment variable. Adding it twice is harmless.
 */
function trustDpasteRoot(): void {
  if (typeof setDefaultCACertificates !== "function" || typeof getCACertificates !== "function") return;

  for (const dir of [__dirname, join(__dirname, "..")]) {
    try {
      const root = readFileSync(join(dir, "assets", "isrg-root-yr.crt"), "utf8");
      const current = getCACertificates("default");
      if (!current.includes(root)) setDefaultCACertificates([...current, root]);
      return;
    } catch {
      // Try the repository layout next; the request reports the CA hint if neither exists.
    }
  }
}

trustDpasteRoot();


export type PasteInput = {
  content: string;
  title?: string;
  syntax?: string;
  expiryDays: number;
};

export class DpasteError extends Error {}

/** The API takes a form body, not JSON. Blank title and syntax are omitted. */
export function buildBody(input: PasteInput): URLSearchParams {
  const body = new URLSearchParams({
    content: input.content,
    expiry_days: String(input.expiryDays),
  });

  const title = input.title?.trim();
  if (title) body.set("title", title);
  if (input.syntax) body.set("syntax", input.syntax);

  return body;
}

/** The link is in `Location`; the body carries it too. Neither is trusted blindly. */
export function linkFrom(location: string | null, body: string): string {
  const candidate = location?.trim() || body.trim();

  try {
    const url = new URL(candidate);
    if (url.protocol === "https:" && url.pathname.length > 1) return url.toString();
  } catch {
    // Fall through to the one message below.
  }

  throw new DpasteError("dpaste did not return a link. The paste may still exist; check dpaste.com.");
}

export function failureMessage(status: number): string {
  if (status === 400) return "dpaste rejected the paste. Check the title, syntax and expiry.";
  if (status === 413) return "The paste is too large for dpaste.";
  if (status === 429) return "dpaste allows one paste per second. Wait a moment and try again.";
  if (status >= 500) return `dpaste is having trouble (HTTP ${status}). Try again later.`;
  return `dpaste refused the paste (HTTP ${status}).`;
}

/** `fetch` hides the TLS reason in `cause`, and a stale CA store is the one worth naming. */
export function networkMessage(error: unknown): string {
  const cause = (error as { cause?: unknown } | undefined)?.cause;
  const detail = cause instanceof Error ? cause.message : error instanceof Error ? error.message : "";
  const message = `Could not reach dpaste.com. ${detail}`.trim();

  return /certificate|issuer|self.signed/i.test(detail) ? `${message} The system CA store may be out of date.` : message;
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export async function createPaste(input: PasteInput, send: FetchLike = fetch): Promise<string> {
  let response: Response;

  try {
    response = await send(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "text/plain",
        // The terms ask automated clients to identify themselves.
        "User-Agent": "vicinae-dpaste",
      },
      body: buildBody(input),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new DpasteError(networkMessage(error));
  }

  if (response.status !== 201) throw new DpasteError(failureMessage(response.status));

  return linkFrom(response.headers.get("location"), await response.text());
}
