import { BwCliError } from "~/api/cli";

export class ManuallyThrownError extends Error {
  constructor(message: string, stack?: string) {
    super(message);
    this.stack = stack;
  }
}

/** An error whose message is safe and useful to show to the user. */
export class DisplayableError extends ManuallyThrownError {
  constructor(message: string, stack?: string) {
    super(message, stack);
  }
}

/* -- specific errors below -- */

export class InstalledCLINotFoundError extends DisplayableError {
  constructor(message: string) {
    super(message);
    this.name = "InstalledCLINotFoundError";
  }
}

export class FailedToLoadVaultItemsError extends ManuallyThrownError {
  constructor(message = "Failed to load vault items") {
    super(message);
    this.name = "FailedToLoadVaultItemsError";
  }
}

export class VaultIsLockedError extends DisplayableError {
  constructor() {
    super("Vault is locked");
    this.name = "VaultIsLockedError";
  }
}

export class NotLoggedInError extends ManuallyThrownError {
  constructor(message = "Not logged in") {
    super(message);
    this.name = "NotLoggedInError";
  }
}

export class PremiumFeatureError extends ManuallyThrownError {
  constructor() {
    super("Premium status is required to use this feature");
    this.name = "PremiumFeatureError";
  }
}

export class InvalidSessionTokenError extends ManuallyThrownError {
  constructor() {
    super("Invalid session token");
    this.name = "InvalidSessionTokenError";
  }
}

/* -- error utils below -- */

export function tryExec<T>(fn: () => T): T extends void ? T : T | undefined;
export function tryExec<T, F>(fn: () => T, fallbackValue: F): T | F;
export function tryExec<T, F>(fn: () => T, fallbackValue?: F): T | F | undefined {
  try {
    return fn();
  } catch {
    return fallbackValue;
  }
}

export function getDisplayableErrorMessage(error: unknown): string | undefined {
  return error instanceof DisplayableError ? error.message : undefined;
}

export const getErrorString = (error: unknown): string | undefined => {
  if (!error) return undefined;
  if (typeof error === "string") return error;
  if (error instanceof BwCliError) return error.stderr || error.message;
  if (error instanceof Error) {
    return error.stack ? `${error.name}: ${error.message}\n${error.stack}` : `${error.name}: ${error.message}`;
  }
  return String(error);
};

export type Success<T> = [T, null];
export type Failure<E> = [null, E];
export type Result<T, E = Error> = Success<T> | Failure<E>;

export function Ok<T>(data: T): Success<T> {
  return [data, null];
}

export function Err<E = Error>(error: E): Failure<E> {
  return [null, error];
}

/** Runs a function or promise in a try/catch and returns a `[data, error]` tuple. */
export function tryCatch<T, E = Error>(fnOrPromise: (() => T) | Promise<T>): MaybePromise<Result<T, E>> {
  if (typeof fnOrPromise === "function") {
    try {
      return Ok(fnOrPromise());
    } catch (error) {
      return Err(error as E);
    }
  }
  return fnOrPromise.then((data) => Ok(data)).catch((error) => Err(error as E));
}

/**
 * Extracts the CLI's message from an error.
 *
 * The CLI writes human-readable text to stderr, so that is preferred over the
 * generic wrapper message.
 */
export function getCliErrorText(error: unknown): string {
  if (error instanceof BwCliError) return error.stderr.trim() || error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

/** Replaces a sensitive value before it reaches a log or the clipboard. */
export function omitSensitiveValue(value: string, sensitiveValue: string): string {
  if (!sensitiveValue) return value;
  return value.replace(new RegExp(sensitiveValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "[REDACTED]");
}
