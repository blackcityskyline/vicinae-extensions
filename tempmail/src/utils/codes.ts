/**
 * Verification codes as the upstream temp-mail widget finds them
 * (github.com/AhmadRun/temp-mail, TempMail.js): mail.tm's own `verifications`
 * field first, then a short number sitting near a code-like word.
 *
 * The API's context document names `Message/verifications` and no type. Measured
 * 2026-11-12 against a live message, it is not a list of codes at all: mail.tm puts
 * the authentication result there (`{tls: {...}, spf: false, dkim: false}`), and
 * iterating it threw inside the message view. So the field is only read when it
 * really is an array, which is the shape the upstream widget assumed.
 */

const CODE_WORDS = "code|pin|otp|verif\\w*|confirm\\w*|password|كود|رمز";

const MAX_CODE_LENGTH = 12;
const MAX_CODES = 3;

function entry(value: unknown): string {
  if (typeof value === "object" && value !== null) {
    const fields = value as { code?: unknown; value?: unknown };
    return String(fields.code || fields.value || "");
  }
  return String(value ?? "");
}

export function findCodes(
  subject: string,
  text: string,
  verifications: unknown = [],
): string[] {
  const codes: string[] = [];

  const add = (candidate: unknown): void => {
    const code = entry(candidate).trim();
    // A link is never a code, whatever field it came from.
    if (!code || code.length > MAX_CODE_LENGTH || /^https?:/i.test(code) || codes.includes(code)) return;
    codes.push(code);
  };

  for (const found of Array.isArray(verifications) ? verifications : []) {
    add(found);
    if (codes.length >= MAX_CODES) return codes;
  }
  if (codes.length > 0) return codes;

  // The gap between the word and the number allows newlines: mail wraps at
  // seventy-eight characters, so "Your code is:\n123456" is the common shape and
  // the upstream gap excludes \n and finds nothing. The digits must also stand
  // alone: a live FormSubmit mail is a confirm URL like `/confirm/e70020df…`, and
  // the "70020" inside that token was offered as a code.
  const prose = new RegExp(`(?:${CODE_WORDS})[^\\d]{0,40}(?<!\\w)(\\d{4,8})(?!\\w)`, "gi");
  for (const match of `${subject || ""}\n${text || ""}`.matchAll(prose)) {
    add(match[1]);
    if (codes.length >= MAX_CODES) return codes;
  }
  if (codes.length > 0) return codes;

  // Nothing near a word: a number on its own in the subject is still worth offering.
  const bare = /\b(\d{4,8})\b/.exec(subject || "");
  if (bare) add(bare[1]);

  return codes;
}
