/**
 * The command line users type in the gesture form, split the way a shell would
 * split it but without running a shell: quotes group words, backslash escapes.
 * edgepad itself takes an argv array, so this is the only place the string is
 * interpreted.
 */
export function parseArgv(input: string): string[] {
  const out: string[] = [];
  let current = "";
  let quote: string | null = null;
  let escaped = false;
  let started = false;

  for (const ch of input) {
    if (escaped) {
      current += ch;
      escaped = false;
    } else if (quote === '"' && ch === "\\") {
      escaped = true;
    } else if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      started = true;
    } else if (ch === "\\") {
      escaped = true;
      started = true;
    } else if (/\s/.test(ch)) {
      if (started) {
        out.push(current);
        current = "";
        started = false;
      }
    } else {
      current += ch;
      started = true;
    }
  }

  if (quote) throw new Error(`Unterminated ${quote === '"' ? "double" : "single"} quote`);
  if (escaped) current += "\\";
  if (started) out.push(current);
  return out;
}

/** The inverse of `parseArgv`, for prefilling the form from an existing binding. */
export function formatArgv(argv: string[]): string {
  return argv
    .map((arg) =>
      arg === "" || /[\s"'\\]/.test(arg) ? `"${arg.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : arg,
    )
    .join(" ");
}
