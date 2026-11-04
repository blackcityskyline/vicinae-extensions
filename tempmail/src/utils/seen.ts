/**
 * Which messages a person has not been told about yet, and how to say that in
 * one line. Kept apart from the notification call so the rule that decides
 * "new" can be tested without a desktop session.
 */

/** Enough to find an id in a list; a full message is not needed. */
export type Identified = { id: string };

/**
 * The ids already reported, or `null` when this is the first look at the inbox.
 * `LocalStorage.getItem` answers with `null` for a key never written, so that is
 * the shape here rather than an empty list — and an empty list would mean
 * "nothing has been reported", which is a different thing.
 */
export function unreported<T extends Identified>(messages: readonly T[], reported: readonly string[] | null): T[] {
  if (reported === null) return [];
  const known = new Set(reported);
  return messages.filter((message) => !known.has(message.id));
}

/** The subject of the notification. One mail reads as one mail. */
export function newMailTitle(count: number): string {
  return count === 1 ? "New email" : `${count} new emails`;
}

/**
 * Who sent it, preferring the display name. The notification body carries this
 * and nothing else: subjects routinely contain the verification code the mail
 * was sent to deliver, and a notification is rendered on screen in front of
 * anyone and is kept in the notification history.
 */
export function senderLabel(fromName: string, from: string): string {
  const name = (fromName ?? "").trim();
  if (name !== "") return name;
  const address = (from ?? "").trim();
  return address !== "" ? address : "unknown";
}
