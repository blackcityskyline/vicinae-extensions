/**
 * The parts of the mail.tm API that are pure, kept apart from the network so they
 * can be tested. The upstream description says this extension talks to mail.gw;
 * it does not — mail.gw now answers 502 on every request, and its sibling
 * mail.tm is the same project on the same API. Measured from this machine.
 */

export type MailErrorKind = "network" | "token" | "rate" | "taken" | "server";

export class MailError extends Error {
  readonly kind: MailErrorKind;

  constructor(kind: MailErrorKind, message: string) {
    super(message);
    this.name = "MailError";
    this.kind = kind;
  }
}

/** Members of a hydra collection, or the item itself, or nothing. */
export function unwrap<T>(response: unknown): T[] {
  const body = response as { "hydra:member"?: T[] } | T[] | undefined;
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body["hydra:member"])) return body["hydra:member"];
  return [];
}

/** The API returns 30 per page and no reliable total to stop on. */
const PAGE_SIZE = 30;

/** Ten pages is 300 messages; past that something is wrong, not busy. */
const MAX_PAGES = 10;

export async function unwrapAll<T>(fetchPage: (page: number) => Promise<unknown>): Promise<T[]> {
  const all: T[] = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const items = unwrap<T>(await fetchPage(page));
    all.push(...items);
    if (items.length < PAGE_SIZE) break;
  }

  return all;
}

const TAKEN = /already (been )?(taken|exists|registered)/i;

/** Turns a status and body into something worth putting in front of a person. */
export function apiError(status: number, body: string): MailError {
  if (status === 0) return new MailError("network", "Could not reach mail.tm. Check the connection.");

  if (status === 401 || status === 403) {
    return new MailError("token", "This address no longer works on mail.tm. Create a new one.");
  }

  if (status === 429) {
    return new MailError("rate", "mail.tm is rate limiting this inbox. Wait a minute and refresh.");
  }

  if (status === 422) {
    // 422 covers an invalid domain too, which is not the user's fault, so only
    // the taken-address answer is reported as a taken address.
    if (TAKEN.test(body)) return new MailError("taken", "That address is already taken.");
    return new MailError("server", `mail.tm refused the address. ${body}`.trim());
  }

  return new MailError("server", `mail.tm answered ${status}.`);
}

/**
 * What the API will actually register. Measured: an address containing `-` and
 * one containing `.` both answer 201. Leading or trailing `-` and `.` are not
 * tried, because an address that looks local is not worth guessing at — the form
 * reports it instead.
 */
const ADDRESS_SAFE = /^[a-z0-9][a-z0-9._-]*[a-z0-9]$/;

const MAX_USERNAME = 30;

/**
 * Address-safe and short. Upstream builds "angry-purple-bear-417" with a word
 * generator; a hex string does the same job with no dependency, and some signup
 * forms reject long addresses.
 */
export function randomUsername(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function isAddressSafe(name: string): boolean {
  return ADDRESS_SAFE.test(name) && name.length >= 3 && name.length <= MAX_USERNAME;
}

/**
 * The shape mail.tm ids have: a twenty-four character hex object id. Upstream
 * checks the same pattern before it will fetch or write anything for a message,
 * and here the check protects a filename as well as a URL — the id of a message
 * becomes the name of the file its HTML is written to.
 */
const MESSAGE_ID = /^[a-f0-9]{24}$/;

export function isMessageId(id: string): boolean {
  return MESSAGE_ID.test(id);
}

/**
 * How far ahead an address may live, however many times it is extended.
 * Upstream's rule: an address never lives more than sixty minutes from now, so
 * the extend button buys time but never turns a throwaway into a mailbox.
 */
export const MAX_LIFETIME_MS = 60 * 60_000;

/** The new expiry for an address extended by `minutes`, capped at the limit. */
export function extendExpiry(expiresAt: number, minutes: number, now: number): number {
  return Math.min(expiresAt + minutes * 60_000, now + MAX_LIFETIME_MS);
}

/**
 * Whether a lifetime has run out. A missing expiry is not an expired one: an
 * address created before this extension kept lifetimes is left alone rather
 * than thrown away under the person who is still using it.
 */
export function isExpired(expiresAt: number, now: number): boolean {
  return expiresAt > 0 && now >= expiresAt;
}
