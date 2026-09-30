import assert from "node:assert/strict";
import { createTotpGenerator, base32ToBuffer } from "../src/utils/totp.ts";

// base32("12345678901234567890")
const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

let failures = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (error) {
    failures++;
    console.log(`FAIL ${name}: ${(error as Error).message}`);
  }
}

check("base32 decodes to the RFC 4226 key", () => {
  assert.deepEqual(
    base32ToBuffer(RFC_SECRET),
    Buffer.from("12345678901234567890", "ascii"),
  );
});

check("base32 decoder ignores whitespace and padding", () => {
  assert.deepEqual(base32ToBuffer("GEZD GNBV GY3T QOJQ GEZD GNBV GY3T QOJQ"), base32ToBuffer(RFC_SECRET));
  assert.deepEqual(base32ToBuffer(`${RFC_SECRET}======`), base32ToBuffer(RFC_SECRET));
});

// RFC 6238 Appendix B, SHA-1, 8 digits, 30s period.
const rfcVectors: Array<[number, string]> = [
  [59, "94287082"],
  [1111111109, "07081804"],
  [1111111111, "14050471"],
  [1234567890, "89005924"],
  [2000000000, "69279037"],
  [20000000000, "65353130"],
];

check("TOTP matches the RFC 6238 SHA-1 vectors", () => {
  for (const [timestampSeconds, expected] of rfcVectors) {
    // The generator reads the wall clock, so drive it with a stubbed Date.
    const realNow = Date.now;
    Date.now = () => timestampSeconds * 1000;
    try {
      const uri = `otpauth://totp/Vec:${timestampSeconds}?secret=${RFC_SECRET}&digits=8&period=30&algorithm=SHA1`;
      const actual = createTotpGenerator(uri).generate();
      assert.equal(actual, expected, `t=${timestampSeconds}: got ${actual}, want ${expected}`);
    } finally {
      Date.now = realNow;
    }
  }
});

check("a bare base32 secret uses TOTP defaults", () => {
  const realNow = Date.now;
  Date.now = () => 59_000;
  try {
    assert.equal(createTotpGenerator(RFC_SECRET).generate(), "287082");
  } finally {
    Date.now = realNow;
  }
});

check("otpauth URI without a label segment parses", () => {
  const realNow = Date.now;
  Date.now = () => 59_000;
  try {
    assert.equal(createTotpGenerator(`otpauth://totp?secret=${RFC_SECRET}`).generate(), "287082");
  } finally {
    Date.now = realNow;
  }
});

check("whitespace in a secret is ignored", () => {
  const realNow = Date.now;
  Date.now = () => 59_000;
  try {
    assert.equal(
      createTotpGenerator("GEZD GNBV GY3T QOJQ GEZD GNBV GY3T QOJQ").generate(),
      "287082",
    );
  } finally {
    Date.now = realNow;
  }
});

check("Steam Guard produces 5 Steam-alphabet characters", () => {
  const code = createTotpGenerator(`steam://${RFC_SECRET}`).generate();
  assert.match(code, /^[23456789BCDFGHJKMNPQRTVWXY]{5}$/);
});

check("Steam Guard base-26 encodes the 31-bit HOTP truncation", () => {
  const realNow = Date.now;
  Date.now = () => 59_000;
  try {
    // t=59s is counter 1, whose RFC 4226 truncation is 1094287082
    // (mod 1e6 = 287082, matching the published vector). Steam renders that
    // same 31-bit integer in its own 26-character alphabet.
    const alphabet = "23456789BCDFGHJKMNPQRTVWXY";
    let value = 1094287082;
    let expected = "";
    for (let i = 0; i < 5; i++) {
      expected += alphabet[value % alphabet.length];
      value = Math.floor(value / alphabet.length);
    }
    assert.equal(createTotpGenerator(`steam://${RFC_SECRET}`).generate(), expected);
  } finally {
    Date.now = realNow;
  }
});

check("Steam Guard rejects a key with invalid base32 characters", () => {
  assert.throws(() => createTotpGenerator("steam://!!!!"), /Invalid character/);
});

check("period and remaining reflect the URI", () => {
  const realNow = Date.now;
  Date.now = () => 59_000;
  try {
    const generator = createTotpGenerator(`otpauth://totp/x?secret=${RFC_SECRET}&period=60`);
    assert.equal(generator.period, 60);
    assert.equal(generator.remaining(), 1000);
  } finally {
    Date.now = realNow;
  }
});

check("an empty key is rejected", () => {
  assert.throws(() => createTotpGenerator("   "), /Empty authenticator key/);
});

check("a malformed otpauth URI is rejected", () => {
  assert.throws(() => createTotpGenerator("otpauth://totp/x?secret=!!!!"), /secret|parse|Invalid/i);
  assert.throws(() => createTotpGenerator("otpauth://hotp/x?secret=" + RFC_SECRET), /HOTP/);
});

console.log(failures === 0 ? "\nall TOTP checks passed" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
