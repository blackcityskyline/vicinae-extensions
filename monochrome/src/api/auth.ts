/**
 * Monochrome's account server is better-auth. Browsers reach it from monochrome.st only —
 * its CORS policy answers that origin alone, which is why sign-in inside their Tauri app
 * fails with "Load failed". Requests from Node are not subject to CORS, so the extension
 * talks to the same endpoints directly.
 */

const AUTH_ORIGIN = "https://auth.monochrome.st";

const TIMEOUT_MS = 15_000;

/**
 * better-auth answers "Missing or null Origin" without this header, in a request from
 * Node as much as from a browser, so the web app's own origin is sent with every call.
 */
const ORIGIN = "https://monochrome.st";

type Raw = Record<string, unknown>;

export type Account = {
  email?: string;
  name?: string;
};

/** What sign-in gives back: the token, plus the identity it just authenticated. */
export type Session = { token: string; account: Account };

function asRecord(value: unknown): Raw | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Raw) : null;
}

/** better-auth's bearer plugin puts the session token next to the user record. */
export function sessionToken(value: unknown): string | undefined {
  const data = asRecord(value);
  if (!data) return undefined;

  for (const candidate of [data.token, asRecord(data.session)?.token]) {
    if (typeof candidate === "string" && candidate !== "") return candidate;
  }
  return undefined;
}

/** `get-session` answers `{session, user}`, an invalid token answers `null`. */
export function accountFrom(value: unknown): Account | null {
  const data = asRecord(value);
  if (!data) return null;

  const user = asRecord(data.user) ?? data;
  const email = typeof user.email === "string" && user.email !== "" ? user.email : undefined;
  const name = typeof user.name === "string" && user.name !== "" ? user.name : undefined;
  if (!email && !name) return null;
  return { ...(email ? { email } : {}), ...(name ? { name } : {}) };
}

/** The server's own message ("Invalid email or password") beats a bare status code. */
export function authFailure(status: number, body: unknown): string {
  const data = asRecord(body);
  const message = data && typeof data.message === "string" ? data.message : undefined;
  return message ?? `The Monochrome account server answered ${status}`;
}

/**
 * The sign-in reply carries the user record next to the token, so the identity never has to be
 * fetched again. That matters because this deployment does not discriminate on
 * `Authorization: Bearer`: `get-session` answers `200 null` both without a session and with an
 * invalid bearer token, ours or a garbage one. Trusting the reply is the only answer that cannot
 * be a false negative.
 */
export function sessionFrom(value: unknown): Session | null {
  const token = sessionToken(value);
  if (!token) return null;
  return { token, account: accountFrom(value) ?? {} };
}

/** A session as it was stored; anything unreadable is no session at all. */
export function decodeSession(raw: string | undefined): Session | undefined {
  if (raw === undefined || raw === "") return undefined;
  try {
    const data = asRecord(JSON.parse(raw));
    const token = data && typeof data.token === "string" && data.token !== "" ? data.token : undefined;
    if (!data || !token) return undefined;
    return { token, account: accountFrom(data.account) ?? {} };
  } catch {
    return undefined;
  }
}

async function post(path: string, payload: Record<string, string>): Promise<unknown> {
  const response = await fetch(`${AUTH_ORIGIN}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(authFailure(response.status, body));
  return body;
}

async function startSession(path: string, payload: Record<string, string>): Promise<Session> {
  const session = sessionFrom(await post(path, payload));
  if (!session) throw new Error("Monochrome accepted the credentials but returned no session token");
  return session;
}

export function signIn(email: string, password: string): Promise<Session> {
  return startSession("/api/auth/sign-in/email", { email, password });
}

export function signUp(email: string, password: string, name: string): Promise<Session> {
  return startSession("/api/auth/sign-up/email", { email, password, name });
}
