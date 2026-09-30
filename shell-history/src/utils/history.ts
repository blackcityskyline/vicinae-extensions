/**
 * History file formats and the masking applied to what is put on screen.
 *
 * The parsers work on text alone so that each shell's format can be checked
 * against a fixture instead of against whatever happens to be on the machine.
 */

export type Shell = "bash" | "fish" | "zsh";

export type Entry = {
  command: string;
  when?: number;
  shell: Shell;
};

const REDACTED = "***";

/** Credential-shaped literals, long enough that an ordinary word cannot match. */
const TOKEN_LITERAL =
  /\b(?:gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{20,}|glpat-[A-Za-z0-9_-]{16,}|xox[baprs]-[A-Za-z0-9-]{10,}|sk-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{30,})\b/g;

// The trailing quote is left out of an unquoted value on purpose. `Bearer abc'`
// has to mask `abc` and keep the quote that closes the -H argument, or the
// command shown is no longer the command that ran.
const VALUE = "(\"[^\"]*\"|'[^']*'|[^'\"\\s]*)";

const ENV_ASSIGNMENT = new RegExp(
  `\\b([A-Za-z_]*(?:TOKEN|SECRET|PASSWORD|PASSWD|API_?KEY|ACCESS_?KEY|PRIVATE_?KEY|CREDENTIALS?|PASS)[A-Za-z_]*)=${VALUE}`,
  "g",
);

const LONG_FLAG = new RegExp(
  `(--(?:password|passwd|secret|token|api-?key|auth|bearer))(=|\\s+)${VALUE}`,
  "gi",
);

// `-psecret` is mysql's attached password form. `-p` alone is not enough:
// `-pix_fmt`, `-preset`, `-profile` are ordinary long options that start with the
// same two characters, and masking those makes an ffmpeg line unreadable. The
// command name is what makes the attached form decidable.
const ATTACHED_SHORT_FLAG = /\b(mysql|mariadb)\b((?:[^\n]*\s)?)-p(\S{3,})/g;

// The whole header value goes, scheme word included. An allow-list of schemes
// looks tidier until someone uses one that is not on it: `Authorization: OAuth
// <token>` was read straight past by exactly that mistake. The header name is
// what tells you what it was.
//
// Only a colon counts as the separator. With `=` too, a Python line like
// `authorization = f"SAPISIDHASH ..."` was rewritten as `authorization = ***`,
// which both mangled the line and hid nothing.
const AUTH_HEADER = /(Authorization["']?\s*:\s*)(["']?)([^"'\n]*)\2/gi;

/**
 * Replaces credentials with `***` so the list can be shown on screen.
 *
 * This is deliberately generous. Under-masking puts a live token in a list
 * somebody is screen-sharing, while over-masking only hides the value of the
 * occasional variable whose name happens to contain `KEY`.
 */
export function maskSecrets(command: string): string {
  return command
    .replace(ENV_ASSIGNMENT, `$1=${REDACTED}`)
    .replace(LONG_FLAG, `$1$2${REDACTED}`)
    .replace(ATTACHED_SHORT_FLAG, `$1$2-${REDACTED}`)
    .replace(AUTH_HEADER, `$1${REDACTED}`)
    .replace(TOKEN_LITERAL, REDACTED);
}

/** `#1740000000` — bash writes this before a command when HISTTIMEFORMAT is set. */
const BASH_TIMESTAMP = /^#(\d{9,})$/;

export function parseBash(text: string): Entry[] {
  const entries: Entry[] = [];
  let when: number | undefined;

  for (const line of text.split("\n")) {
    const timestamp = BASH_TIMESTAMP.exec(line.trim());
    if (timestamp) {
      when = Number(timestamp[1]) * 1000;
      continue;
    }
    if (line.trim() === "") continue;
    entries.push({ command: line.trim(), when, shell: "bash" });
    when = undefined;
  }
  return entries;
}

const ZSH_EXTENDED = /^:\s*(\d+):\d+;(.*)$/;

/** zsh ends a continued line with a backslash, preceded by the space it wrote. */
function stripContinuation(line: string): string {
  return line.replace(/\s*\\$/, "");
}

/**
 * zsh writes `: <started>:<elapsed>;<command>`, and a command spanning several
 * lines continues with a trailing backslash on every line but the last.
 */
export function parseZsh(text: string): Entry[] {
  const lines = text.split("\n");
  const extended = lines.some((line) => ZSH_EXTENDED.test(line));
  if (!extended) {
    return lines
      .filter((line) => line.trim() !== "")
      .map((command) => ({ command: command.trim(), shell: "zsh" as Shell }));
  }

  const entries: Entry[] = [];
  let command: string[] = [];
  let when: number | undefined;

  const flush = () => {
    if (command.length === 0) return;
    entries.push({ command: command.join("\n"), when, shell: "zsh" });
    command = [];
  };

  for (const line of lines) {
    const match = ZSH_EXTENDED.exec(line);
    if (match) {
      flush();
      when = Number(match[1]) * 1000;
      command = [stripContinuation(match[2] ?? "")];
    } else if (command.length > 0 && line.trim() !== "") {
      command.push(stripContinuation(line));
    }
  }
  flush();
  return entries;
}

const FISH_ENTRY = /^- cmd: ?(.*)$/;
const FISH_WHEN = /^\s+when: (\d+)$/;

/**
 * fish writes one `- cmd:` per command with its `when:` underneath, and
 * escapes a newline inside the command as a literal `\n` so an entry never
 * spans two lines.
 */
export function parseFish(text: string): Entry[] {
  const entries: Entry[] = [];
  let command: string | undefined;
  let when: number | undefined;

  for (const line of text.split("\n")) {
    const start = FISH_ENTRY.exec(line);
    if (start) {
      // `- cmd:` with nothing after it is how fish marks the start of a
      // session. There is no command in it to search for or to copy.
      if (command) entries.push({ command, when, shell: "fish" });
      command = (start[1] ?? "").replace(/\\n/g, "\n").replace(/\\\\/g, "\\");
      when = undefined;
      continue;
    }
    const timestamp = FISH_WHEN.exec(line);
    if (timestamp && command !== undefined) when = Number(timestamp[1]) * 1000;
  }
  if (command !== undefined) entries.push({ command, when, shell: "fish" });

  return entries;
}

export function mergeHistories(histories: Entry[][]): Entry[] {
  return histories.flat().sort((left, right) => (right.when ?? 0) - (left.when ?? 0));
}
