import { HOTP, Secret, TOTP, URI } from "otpauth";
import { createHmac } from "node:crypto";


/** Steam Guard's alphabet omits visually ambiguous characters. */
const STEAM_CHARS = "23456789BCDFGHJKMNPQRTVWXY";
const STEAM_PERIOD = 30;

/**
 * `otpauth` requires a non-empty label path segment, but Bitwarden also accepts
 * `otpauth://totp?secret=...`. A placeholder label keeps those parseable; the
 * label is not used for code generation.
 */
const OTPAUTH_URI_WITHOUT_LABEL = /^(otpauth:\/\/(?:totp|hotp))\?/;

export type HashAlgorithm = "SHA1" | "SHA256" | "SHA512";

export type TotpGenerator = {
  generate: () => string;
  /** Milliseconds until the current code expires. */
  remaining: () => number;
  period: number;
};

export class InvalidAuthenticatorKeyError extends Error {
  constructor(message = "Failed to parse authenticator key") {
    super(message);
    this.name = "InvalidAuthenticatorKeyError";
  }
}

/**
 * Builds a code generator for a Bitwarden TOTP field.
 *
 * Bitwarden stores either a bare base32 secret or a full `otpauth://` URI, and
 * also supports Steam Guard, which is HMAC-SHA1 with a custom 5-character
 * alphabet.
 */
export function createTotpGenerator(totpField: string): TotpGenerator {
  const secret = totpField.trim();
  if (!secret) throw new InvalidAuthenticatorKeyError("Empty authenticator key");

  if (secret.startsWith("steam://")) {
    return createSteamGenerator(secret.slice("steam://".length).trim());
  }

  const uri = secret.includes("otpauth") ? secret.replace(OTPAUTH_URI_WITHOUT_LABEL, "$1/_?") : secret;
  const totp = parseTotp(uri);

  return {
    period: totp.period,
    remaining: () => totp.remaining(),
    generate: () => totp.generate(),
  };
}

function parseTotp(uri: string): TOTP {
  if (!uri.includes("otpauth")) {
    // A bare secret: otpauth defaults apply (SHA1, 6 digits, 30s).
    return new TOTP({ secret: Secret.fromBase32(uri.replace(/\s/g, "")) });
  }

  // `URI.parse` validates HOTP-specific parameters and would otherwise fail with
  // a confusing "missing counter" message, so the type is checked up front.
  if (/^otpauth:\/\/hotp/i.test(uri)) throw new InvalidAuthenticatorKeyError("HOTP codes are not supported");

  let parsed: ReturnType<typeof URI.parse>;
  try {
    parsed = URI.parse(uri);
  } catch (error) {
    throw new InvalidAuthenticatorKeyError(
      error instanceof Error ? error.message : "Failed to parse authenticator key",
    );
  }

  if (parsed instanceof HOTP) throw new InvalidAuthenticatorKeyError("HOTP codes are not supported");
  if (!parsed.secret.base32) throw new InvalidAuthenticatorKeyError("Authenticator key has no secret");
  return parsed;
}

/**
 * Steam Guard uses the same HMAC-SHA1 counter as TOTP, but base32-encodes the
 * 31-bit dynamic-truncation value with a Steam-specific alphabet, 5 characters
 * long. That is not a re-encoding of the 6-digit decimal output, so the
 * truncation is done here directly from the HMAC.
 */
function createSteamGenerator(secret: string): TotpGenerator {
  if (!secret) throw new InvalidAuthenticatorKeyError("Invalid Steam Guard key");

  const key = base32ToBuffer(secret.replace(/\s/g, ""));
  const totp = new TOTP({ secret: Secret.fromBase32(secret.replace(/\s/g, "")) });

  return {
    period: STEAM_PERIOD,
    remaining: () => totp.remaining(),
    generate: () => {
      const counter = Math.floor(Date.now() / 1000 / STEAM_PERIOD);
      const counterBuffer = Buffer.alloc(8);
      counterBuffer.writeBigUInt64BE(BigInt(counter));

      const digest = createHmac("sha1", key).update(counterBuffer).digest();
      const offset = digest[digest.length - 1]! & 0x0f;
      const truncated =
        ((digest[offset]! & 0x7f) << 24) |
        ((digest[offset + 1]! & 0xff) << 16) |
        ((digest[offset + 2]! & 0xff) << 8) |
        (digest[offset + 3]! & 0xff);

      let code = "";
      let value = truncated;
      for (let i = 0; i < 5; i++) {
        code += STEAM_CHARS[value % STEAM_CHARS.length];
        value = Math.floor(value / STEAM_CHARS.length);
      }
      return code;
    },
  };
}


const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Decodes a base32 secret (RFC 4648, no padding) into the raw HMAC key. */
export function base32ToBuffer(base32: string): Buffer {
  const clean = base32.toUpperCase().replace(/=+$/, "").replace(/\s/g, "");
  const bytes: number[] = [];
  let buffer = 0;
  let bitsLeft = 0;

  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) throw new InvalidAuthenticatorKeyError("Invalid character in Steam Guard key");
    buffer = (buffer << 5) | index;
    bitsLeft += 5;
    if (bitsLeft >= 8) {
      bitsLeft -= 8;
      bytes.push((buffer >> bitsLeft) & 0xff);
    }
  }

  return Buffer.from(bytes);
}
