import assert from "node:assert/strict";

import { findCodes } from "../src/utils/codes.ts";

let checks = 0;
function check(name: string, body: () => void) {
  try {
    body();
    checks++;
    console.log(`ok   ${name}`);
  } catch (error) {
    console.log(`FAIL ${name}`);
    console.log(`     ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  }
}

// The expected values come from the upstream temp-mail widget
// (https://github.com/AhmadRun/temp-mail, TempMail.js and tests/test_temp_mail.js),
// not from this implementation.

check("mail.tm's own verifications field wins over the prose", () => {
  assert.deepEqual(findCodes("Welcome", "Your code is 111111", ["123456", "abcdef"]), ["123456", "abcdef"]);
  assert.deepEqual(findCodes("", "", [{ code: "AB12" }, { value: "CD34" }]), ["AB12", "CD34"]);
});

check("a link in the verifications field is not a code", () => {
  assert.deepEqual(findCodes("", "", ["https://x.com/v"]), []);
  assert.deepEqual(findCodes("", "", ["123456", "https://x.com/v", "http://y.z"]), ["123456"]);
});

check("anything over twelve characters is not a code", () => {
  assert.deepEqual(findCodes("", "", ["0123456789abc"]), []);
  assert.deepEqual(findCodes("", "", ["0123456789ab"]), ["0123456789ab"]);
  assert.deepEqual(findCodes("", "", ["0123456789"]), ["0123456789"]);
});

check("codes are deduplicated and capped at three", () => {
  assert.deepEqual(findCodes("", "", ["123456", "123456", "234567", "345678", "456789"]), [
    "123456",
    "234567",
    "345678",
  ]);
});

check("a code near a code-like word in the text", () => {
  assert.deepEqual(findCodes("Welcome", "Your verification code is: 482913\nThanks", []), ["482913"]);
  assert.deepEqual(findCodes("", "Enter the PIN 2026 when asked", []), ["2026"]);
  assert.deepEqual(findCodes("", "رمز الدخول 482913", []), ["482913"]);
});

check("the code may be on the line after the word", () => {
  // Mail wraps at 78 characters all the time, and the upstream gap excludes \n,
  // so "Your code is:\n123456" found nothing there.
  assert.deepEqual(findCodes("", "Your code is:\n123456", []), ["123456"]);
  assert.deepEqual(findCodes("Confirmation", "Please confirm\nwith 99887766", []), ["99887766"]);
});

check("a bare number in the subject is used when nothing else was found", () => {
  assert.deepEqual(findCodes("482913 is your login", "", []), ["482913"]);
});

check("numbers that are not near a code-like word are left alone", () => {
  assert.deepEqual(findCodes("Hello", "Order total 2026 items", []), []);
  assert.deepEqual(findCodes("", "Your call 1234567890 terminated", []), []);
  assert.deepEqual(findCodes("", "It is 2026 now. Code expires soon", []), []);
});

check("an over-long run of digits is not cut down into a code", () => {
  // A 9-digit run has no four-to-eight-digit prefix that ends the run, so it is
  // an account number or a phone, not a code.
  assert.deepEqual(findCodes("", "Your code is 123456789", []), []);
});

check("nothing at all is not a code", () => {
  assert.deepEqual(findCodes("", "", []), []);
  assert.deepEqual(findCodes("", "", undefined), []);
  assert.deepEqual(findCodes(undefined as unknown as string, null as unknown as string, []), []);
});

console.log(`${checks} checks passed`);
