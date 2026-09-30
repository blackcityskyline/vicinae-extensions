import { createTotpGenerator, InvalidAuthenticatorKeyError, type TotpGenerator } from "~/utils/totp";
import { Err, Ok, type Result } from "~/utils/errors";
import { captureException } from "~/utils/log";

export { createTotpGenerator, InvalidAuthenticatorKeyError };
export type { TotpGenerator };

/**
 * Builds a code generator, returning a `[generator, error]` tuple so the list
 * can render the failure inline instead of handling an exception.
 */
export function getGenerator(totpField: string): Result<TotpGenerator> {
  try {
    return Ok(createTotpGenerator(totpField));
  } catch (error) {
    captureException("Failed to initialize authenticator", error);
    return Err(new Error("Failed to initialize authenticator"));
  }
}
