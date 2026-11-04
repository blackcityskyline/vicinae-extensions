import { LocalStorage } from "@vicinae/api";

import { clearSandboxedHtml } from "~/api/html";
import type { MailMessage } from "~/utils/body";
import {
  apiError,
  extendExpiry,
  isAddressSafe,
  MailError,
  randomUsername,
  unwrap,
  unwrapAll,
} from "~/utils/mail";

/**
 * mail.tm, not mail.gw. The upstream description names mail.gw, but its own
 * source already points at mail.tm, and that is the one that answers: measured
 * from this machine, api.mail.gw returns 502 on every path and api.mail.tm
 * returns 200. Same project, same hydra API.
 */
const API = "https://api.mail.tm";

/** The API allows 30 requests a minute; a hung one must not hang the panel. */
const TIMEOUT_MS = 15_000;

const ADDRESS = "address";
const PASSWORD = "password";
const TOKEN = "token";
const ID = "accountId";
const EXPIRES = "expiresAt";
/** The ids already announced by a notification, so the next poll does not repeat them. */
const REPORTED = "reportedMessageIds";
/** The expiry the "one minute left" notice was already sent for. */
const WARNED = "expiryWarnedAt";

/** Enough ids to remember; a temp inbox that outgrows this is not being read anyway. */
const MAX_REPORTED = 100;

/** The account id is needed to delete the account, and is not the address. */
type CachedAccount = { address: string; password: string; id?: string };

/**
 * What the inbox shows about the address. Times are epoch milliseconds, kept as
 * they are rather than as a rendered string, so a countdown compares against the
 * real clock and survives the launcher being closed and reopened.
 */
export type State = { address: string; expiresAt: number };

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; token?: string; contentType?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = options.contentType ?? "application/json";
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    // A timeout and a refused connection both land here; both mean the same to
    // the person reading it.
    throw new MailError("network", `Could not reach mail.tm. ${error instanceof Error ? error.message : ""}`.trim());
  }

  if (!response.ok) {
    throw apiError(response.status, await response.text().catch(() => ""));
  }

  return (await response.json()) as T;
}

/** One token request, retried once when the cached one turns out to be stale. */
async function withToken<T>(body: (token: string) => Promise<T>): Promise<T> {
  const token = await validToken();

  try {
    return await body(token);
  } catch (error) {
    if (!(error instanceof MailError) || error.kind !== "token") throw error;

    await LocalStorage.removeItem(TOKEN);
    return body(await validToken());
  }
}

async function validToken(): Promise<string> {
  const cached = await LocalStorage.getItem<string>(TOKEN);
  if (cached) return cached;

  const account = await readAccount();
  if (!account) throw new MailError("token", "No address yet.");

  const answer = await request<{ token: string }>("/token", {
    method: "POST",
    body: { address: account.address, password: account.password },
  });

  await LocalStorage.setItem(TOKEN, answer.token);
  return answer.token;
}

async function readAccount(): Promise<CachedAccount | undefined> {
  const [address, password] = await Promise.all([
    LocalStorage.getItem<string>(ADDRESS),
    LocalStorage.getItem<string>(PASSWORD),
  ]);

  return address && password ? { address, password } : undefined;
}

/** The address and how long it is allowed to live; `undefined` when there is none. */
export async function state(): Promise<State | undefined> {
  const stored = await readAccount();
  if (!stored) return undefined;

  const expiresAt = await LocalStorage.getItem<string>(EXPIRES);

  return {
    address: stored.address,
    // An address stored before lifetimes existed has no expiry rather than an
    // expired one; it is the person's to throw away, not ours to take back.
    expiresAt: Number(expiresAt) || 0,
  };
}

/**
 * The domains the API will currently register on. The list changes over time
 * (`uberip.com` in October 2026, `fldubai.com` in November — see the audit), so
 * it is read live rather than hardcoded.
 */
export async function domains(): Promise<string[]> {
  const members = unwrap<{ domain: string; isActive?: boolean; isPrivate?: boolean }>(await request("/domains"));
  const usable = members
    .filter((member) => member.isActive !== false && member.isPrivate !== true)
    .map((member) => member.domain);
  return usable.length > 0 ? usable : members.map((member) => member.domain);
}

/** Replace any current address with `username@domain`, alive for `minutes` from now. */
export async function register(username: string, domain: string, minutes: number): Promise<State> {
  const local = username.trim().toLowerCase();
  if (!isAddressSafe(local)) throw new MailError("taken", "That username cannot be used.");

  // One address at a time, the way upstream's helper does it: creating a second
  // would orphan the first on the server, still receiving mail nobody can read.
  if (await readAccount()) await unregister();

  const account = { address: `${local}@${domain}`, password: crypto.randomUUID().replace(/-/g, "") };
  const created = await request<{ id: string }>("/accounts", { method: "POST", body: account });

  const now = Date.now();
  const expiresAt = now + minutes * 60_000;

  await Promise.all([
    LocalStorage.setItem(ADDRESS, account.address),
    LocalStorage.setItem(PASSWORD, account.password),
    LocalStorage.setItem(ID, created.id),
    LocalStorage.setItem(EXPIRES, String(expiresAt)),
    LocalStorage.removeItem(TOKEN),
    // A new inbox has never been looked at, so nothing in it has been announced.
    LocalStorage.removeItem(REPORTED),
    LocalStorage.removeItem(WARNED),
  ]);

  return { address: account.address, expiresAt };
}

/** The address used on a first run, when the user has not picked a name. */
export async function create(domain: string, minutes: number): Promise<State> {
  return register(randomUsername(), domain, minutes);
}

/**
 * Push the expiry later, never past the cap. An address with no stored expiry
 * gets `minutes` from now, which is what pressing the button means.
 */
export async function extend(minutes: number): Promise<State> {
  const current = await state();
  if (!current) throw new MailError("token", "No address to extend. Create one first.");

  const now = Date.now();
  const expiresAt = extendExpiry(current.expiresAt || now, minutes, now);

  await LocalStorage.setItem(EXPIRES, String(expiresAt));

  return { ...current, expiresAt };
}

export async function unregister(): Promise<void> {
  const id = await LocalStorage.getItem<string>(ID);

  if (id) {
    // Best effort: the address is being discarded locally either way, and a
    // server that will not take the delete must not block the reset.
    await withToken((token) => request(`/accounts/${encodeURIComponent(id)}`, { method: "DELETE", token })).catch(
      () => undefined,
    );
  }

  for (const key of [ADDRESS, PASSWORD, TOKEN, ID, EXPIRES, REPORTED, WARNED]) {
    await LocalStorage.removeItem(key);
  }

  await clearSandboxedHtml();
}

/** Newest first. Page two and beyond only when the first page is full. */
export async function messages(): Promise<MailMessage[]> {
  const items = await withToken((token) =>
    unwrapAll<MailMessage>((page) => request(`/messages?page=${page}`, { token })),
  );

  return items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function message(id: string): Promise<MailMessage> {
  return withToken((token) => request<MailMessage>(`/messages/${encodeURIComponent(id)}`, { token }));
}

export async function markSeen(id: string): Promise<void> {
  await withToken((token) =>
    request(`/messages/${encodeURIComponent(id)}`, {
      method: "PATCH",
      token,
      body: { seen: true },
      contentType: "application/merge-patch+json",
    }),
  );
}

export async function remove(id: string): Promise<void> {
  await withToken((token) => request(`/messages/${encodeURIComponent(id)}`, { method: "DELETE", token }));
}

/**
 * The ids already announced by a notification, or `null` when nothing has been
 * announced yet. The distinction matters: on a first look every message is
 * unknown, and a poll that starts on a full inbox would shout about mail that
 * arrived an hour ago.
 */
export async function reportedIds(): Promise<string[] | null> {
  const stored = await LocalStorage.getItem<string>(REPORTED);
  if (typeof stored !== "string") return null;

  try {
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.map(String) : null;
  } catch {
    return null;
  }
}

/** `messages()` answers newest first, so the head of the list is the newest. */
export async function recordReported(ids: readonly string[]): Promise<void> {
  await LocalStorage.setItem(REPORTED, JSON.stringify(ids.slice(0, MAX_REPORTED)));
}

/** The expiry the warning was sent for, or 0 when this lifetime has not warned. */
export async function warnedExpiry(): Promise<number> {
  const stored = await LocalStorage.getItem<string>(WARNED);
  return typeof stored === "string" ? Number(stored) || 0 : 0;
}

/** Keyed on the expiry rather than the address, so extending allows a second warning. */
export async function recordWarnedExpiry(expiresAt: number): Promise<void> {
  await LocalStorage.setItem(WARNED, String(expiresAt));
}
