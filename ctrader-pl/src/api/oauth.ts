import { createServer, type Server } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { URL } from "node:url";

import type { Environment } from "./config";

/**
 * The OAuth half of the cTrader Open API, which is plain HTTP rather than the port-5036 socket.
 *
 * Everything here was measured: the authorise page 301s to itself without the trailing slash, the
 * token endpoint answers **200** with `{"errorCode": …}` for a bad request (a 200 is not success),
 * and the redirect has to be registered as exactly `http://localhost:7331/callback`.
 */

export const AUTHORIZE_URL = "https://id.ctrader.com/my/settings/openapi/grantingaccess/";
export const TOKEN_URL = "https://openapi.ctrader.com/apps/token";
export const DEFAULT_REDIRECT = "http://localhost:7331/callback";

/** `accounts` is read-only: the token this earns cannot place, amend or close an order. */
export const SCOPE = "accounts";

export type Tokens = { accessToken: string; refreshToken: string };

export function authorizationUrl(options: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: options.clientId,
    redirect_uri: options.redirectUri,
    scope: SCOPE,
    product: "web",
    state: options.state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

function compare(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * The `?code=` out of a redirect, but only when it carries the `state` this run sent.
 *
 * The state is random per authorisation, so a code delivered by anything other than the browser
 * we sent to cTrader — another local process, a crafted link — is refused before it is exchanged.
 */
export function codeFromRedirect(url: string, state: string, path = "/callback"): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.pathname !== path) return null;
  if (!compare(parsed.searchParams.get("state") ?? "", state)) return null;
  return parsed.searchParams.get("code");
}

export type Callback = { code: Promise<string>; close: () => void };

/**
 * Serves the registered redirect URI until a callback with the right state arrives.
 *
 * Vicinae has no OAuth redirect receiver, so the extension has to be one: this is a loopback
 * server that lives no longer than the setup form. A request with the wrong state, or a second
 * one after the code was captured, gets a page saying so and is ignored.
 */
export function waitForCode(redirectUri: string, state: string, timeoutMs = 300_000): Callback {
  const parsed = new URL(redirectUri);
  const port = Number(parsed.port || 80);
  let server: Server | undefined;
  let timer: NodeJS.Timeout | undefined;

  const code = new Promise<string>((resolve, reject) => {
    let settled = false;
    const settle = (error: Error | null, value?: string) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      server?.close();
      if (error) reject(error);
      else resolve(value ?? "");
    };

    server = createServer((request, response) => {
      const reply = (status: number, text: string) => {
        response.writeHead(status, { "content-type": "text/html; charset=utf-8" });
        response.end(`<!doctype html><meta charset="utf-8"><body style="font:16px system-ui;padding:3rem">${text}</body>`);
      };
      const found = codeFromRedirect(request.url ?? "/", state, parsed.pathname);
      if (!found) return reply(400, "This is not the authorisation that was started here.");
      reply(200, "Authorised. You can close this tab and return to Vicinae.");
      settle(null, found);
    });

    server.once("error", (error: NodeJS.ErrnoException) => {
      settle(new Error(
        error.code === "EADDRINUSE"
          ? `port ${port} is already in use — free it and try again`
          : `cannot listen on ${redirectUri}: ${error.message}`,
      ));
    });
    server.listen(port, "127.0.0.1");
    timer = setTimeout(() => settle(new Error("no authorisation arrived within five minutes")), timeoutMs);
  });

  // The listener is cleaned up by whoever awaited `code`, and the promise never rejects unhandled.
  code.catch(() => undefined);

  return { code, close: () => server?.close() };
}

async function tokenCall(params: Record<string, string>): Promise<Tokens> {
  const url = `${TOKEN_URL}?${new URLSearchParams(params).toString()}`;
  const response = await fetch(url);
  const body = (await response.json()) as Record<string, unknown>;
  const payload = typeof body.payload === "object" && body.payload !== null ? (body.payload as Record<string, unknown>) : body;
  const error = body.errorCode ?? payload.errorCode;
  if (error) throw new Error(`${String(error)}: ${String(body.description ?? payload.description ?? "")}`.trim());
  const accessToken = payload.accessToken;
  if (typeof accessToken !== "string" || !accessToken) {
    throw new Error(`the token endpoint returned ${JSON.stringify(body)}`);
  }
  return { accessToken, refreshToken: String(payload.refreshToken ?? "") };
}

export function exchangeCode(options: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}): Promise<Tokens> {
  return tokenCall({
    grant_type: "authorization_code",
    code: options.code,
    redirect_uri: options.redirectUri,
    client_id: options.clientId,
    client_secret: options.clientSecret,
  });
}

export function refreshToken(options: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<Tokens> {
  return tokenCall({
    grant_type: "refresh_token",
    refresh_token: options.refreshToken,
    client_id: options.clientId,
    client_secret: options.clientSecret,
  });
}

export const environmentOf = (live: unknown): Environment => (live === true ? "live" : "demo");
