/**
 * A received HTML part, made safe to hand to a browser.
 *
 * The point is not to rewrite the markup — that would be a second renderer to
 * get wrong — it is to load it under a policy that makes it inert. The guard is
 * on the first line, before anything the sender wrote, because a policy that
 * arrives after the body is one the browser may already have scripted past.
 */
const GUARD = `<meta http-equiv="Content-Security-Policy" content="script-src 'none'; object-src 'none'; form-action 'none'">`;

/** One document, built the way upstream's helper builds it. */
export function sandboxDocument(parts: readonly string[]): string {
  return [`<!doctype html><meta charset="utf-8">${GUARD}`, ...parts].join("\n");
}
