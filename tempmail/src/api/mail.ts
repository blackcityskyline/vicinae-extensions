import { LocalStorage } from "@vicinae/api";

import type { MailMessage } from "~/utils/body";
import { apiError, isAddressSafe, MailError, randomUsername, unwrap, unwrapAll } from "~/utils/mail";

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
const EXPIRY = "expiryMinutes";
const LAST_SEEN = "lastSeenAt";

export type Account = { address: string; password: string };

/** The account id is needed to delete the account, and is not the address. */
type CachedAccount = Account & { id?: string };

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

export async function address(): Promise<string | undefined> {
  return (await readAccount())?.address;
}

/** The domains the API will currently register on. */
export async function domains(): Promise<string[]> {
  const members = unwrap<{ domain: string; isActive?: boolean }>(await request("/domains"));
  const active = members.filter((member) => member.isActive !== false).map((member) => member.domain);
  return active.length > 0 ? active : members.map((member) => member.domain);
}

export async function register(username: string, domain: string): Promise<Account> {
  const local = username.trim().toLowerCase();
  if (!isAddressSafe(local)) throw new MailError("taken", "That username cannot be used.");

  const account = { address: `${local}@${domain}`, password: crypto.randomUUID().replace(/-/g, "") };
  const created = await request<{ id: string }>("/accounts", { method: "POST", body: account });

  await LocalStorage.setItem(ADDRESS, account.address);
  await LocalStorage.setItem(PASSWORD, account.password);
  await LocalStorage.setItem(ID, created.id);
  await LocalStorage.removeItem(TOKEN);
  await touch();

  return account;
}

/** The address used on a first run, when the user has not picked a name. */
export async function registerRandom(domain: string): Promise<Account> {
  return register(randomUsername(), domain);
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

  for (const key of [ADDRESS, PASSWORD, TOKEN, ID, LAST_SEEN]) {
    await LocalStorage.removeItem(key);
  }
}

/** Minutes of not looking at the inbox before the address is thrown away. */
export async function expiryMinutes(): Promise<number> {
  return Number(await LocalStorage.getItem<string>(EXPIRY)) || 0;
}

export async function setExpiryMinutes(minutes: number): Promise<void> {
  if (minutes > 0) await LocalStorage.setItem(EXPIRY, String(minutes));
  else await LocalStorage.removeItem(EXPIRY);
  await touch();
}

async function touch(): Promise<void> {
  await LocalStorage.setItem(LAST_SEEN, new Date().toISOString());
}

/**
 * Whether the address has been left alone for longer than the chosen expiry.
 * Rotation is the caller's decision; this only answers the question.
 */
export async function hasExpired(): Promise<boolean> {
  const minutes = await expiryMinutes();
  if (!minutes) return false;

  const lastSeen = await LocalStorage.getItem<string>(LAST_SEEN);
  if (!lastSeen) return false;

  const idle = Date.now() - new Date(lastSeen).getTime();
  return Number.isFinite(idle) && idle > minutes * 60_000;
}

/** Newest first. Page two and beyond only when the first page is full. */
export async function messages(): Promise<MailMessage[]> {
  const items = await withToken((token) =>
    unwrapAll<MailMessage>((page) => request(`/messages?page=${page}`, { token })),
  );

  await touch();
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

/** The raw message, for saving as a file. */
export async function raw(url: string): Promise<ArrayBuffer> {
  const buffer = await withToken(async (token) => {
    const response = await fetch(`${API}${url}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw apiError(response.status, await response.text().catch(() => ""));
    return response.arrayBuffer();
  });

  return buffer;
}
