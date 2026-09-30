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
    return new MailError("token", "The session expired. Generating a new address.");
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
