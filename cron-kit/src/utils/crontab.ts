/**
 * The crontab as a list of lines rather than a list of jobs.
 *
 * Writing a crontab means writing back every line, including the comments and
 * the variable assignments, so every line keeps the text it came from. A line
 * this parser does not understand is carried through verbatim: a line it gets
 * wrong is then at worst left alone, which is the difference between a cosmetic
 * bug and a lost cron job.
 */

export type CrontabLine =
  | { kind: "job"; text: string; schedule: string; command: string }
  | { kind: "passthrough"; text: string };

export type Described = { kind: "job"; text: string; schedule: string; command: string };

const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

export function isJob(line: CrontabLine | undefined): line is Described {
  return line?.kind === "job";
}

function parseJob(raw: string): CrontabLine {
  const body = raw.trim();
  const fields = body.split(/[ \t]+/);
  const fieldCount = fields[0]?.startsWith("@") ? 1 : 5;

  if (fields.length <= fieldCount) return { kind: "passthrough", text: raw };

  // The offset of the first character after the schedule. Searching from the
  // end of the previous field makes each hit the next field rather than an
  // earlier identical one, which summing lengths alone would not.
  let consumed = 0;
  for (let index = 0; index < fieldCount; index += 1) {
    consumed = body.indexOf(fields[index] ?? "", consumed) + (fields[index]?.length ?? 0);
  }

  return {
    kind: "job",
    text: raw,
    schedule: fields.slice(0, fieldCount).join(" "),
    // Cut out of the original text rather than rejoined from the split, so a
    // line nobody edited cannot come back reformatted.
    command: body.slice(consumed).trimStart(),
  };
}

function parseLine(raw: string): CrontabLine {
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed.startsWith("#") || ASSIGNMENT.test(trimmed)) {
    return { kind: "passthrough", text: raw };
  }
  return parseJob(raw);
}

export function parseCrontab(text: string): CrontabLine[] {
  // `crontab -l` always ends with a newline, and without dropping it every save
  // would append one more blank line to the user's crontab. renderCrontab strips
  // the same trailing newlines, so read and write are symmetric.
  const lines = text.replace(/\n+$/, "").split("\n");
  return lines.every((line) => line.trim() === "") ? [] : lines.map(parseLine);
}

export function renderCrontab(lines: CrontabLine[]): string {
  const text = lines
    .map((line) => line.text)
    .join("\n")
    .replace(/\n+$/, "");
  return text === "" ? "" : `${text}\n`;
}

export function removeJob(lines: CrontabLine[], index: number): CrontabLine[] {
  return lines.filter((_, at) => at !== index);
}

export function replaceJob(lines: CrontabLine[], index: number, schedule: string, command: string): CrontabLine[] {
  const job: Described = { kind: "job", text: `${schedule} ${command}`, schedule, command };
  return lines.map((line, at) => (at === index ? job : line));
}

export function addJob(lines: CrontabLine[], schedule: string, command: string): CrontabLine[] {
  return [...lines, { kind: "job", text: `${schedule} ${command}`, schedule, command }];
}
