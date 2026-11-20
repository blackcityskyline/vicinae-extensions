import * as os from "node:os";
import * as path from "node:path";

export type Format = "png" | "svg";

type Choice = {
  id: string;
  label: string;
};

export type Catalog = {
  languages: Choice[];
  themes: Choice[];
};

const MAX_CHARS = 20_000;
const MAX_LINES = 500;

export function expandHome(p: string, home = os.homedir()): string {
  if (!p || p === "~") return home;
  if (p.startsWith("~/")) return path.join(home, p.slice(2));
  return p;
}

export function fileName(date: Date, format: Format): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("-");
  return `code-${stamp}.${format}`;
}

export function formatFromContentType(value: string | null): Format | null {
  const mime = (value ?? "").split(";")[0]?.trim().toLowerCase();
  if (mime === "image/png") return "png";
  if (mime === "image/svg+xml") return "svg";
  return null;
}

/**
 * The API's own error text is the only place that says what to change, so it is
 * kept verbatim; a proxy's HTML error page is not worth showing.
 */
export function apiErrorMessage(status: number, body: string): string {
  const fallback = `codetoimage.com answered HTTP ${status}`;
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed !== "object" || parsed === null) return fallback;
    const record = parsed as Record<string, unknown>;
    const error = typeof record.error === "string" ? record.error.trim() : "";
    const hint = typeof record.hint === "string" ? record.hint.trim() : "";
    if (!error && !hint) return fallback;
    return [error, hint].filter(Boolean).join(" ");
  } catch {
    return fallback;
  }
}

function choicesFrom(value: unknown): Choice[] {
  if (!Array.isArray(value)) return [];
  const out: Choice[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    if (typeof record.id !== "string" || typeof record.label !== "string") continue;
    out.push({ id: record.id, label: record.label });
  }
  return out;
}

export function parseCatalog(raw: string): Catalog | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const record = parsed as Record<string, unknown>;
  const languages = choicesFrom(record.languages);
  const themes = choicesFrom(record.themes);
  if (languages.length === 0 || themes.length === 0) return null;
  return { languages, themes };
}

export function validateCode(code: string): string | null {
  if (code.trim().length === 0) return "Paste some code first.";
  if (code.length > MAX_CHARS) {
    return `The service accepts at most ${MAX_CHARS.toLocaleString("en-US")} characters; this snippet has ${code.length.toLocaleString("en-US")}.`;
  }
  const lines = code.split("\n").length;
  if (lines > MAX_LINES) {
    return `The service accepts at most ${MAX_LINES} lines; this snippet has ${lines}.`;
  }
  return null;
}
