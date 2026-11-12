import { existsSync, statSync } from "node:fs";

/** The clipboard is only useful to this extension when it holds a path to an existing file. */
export function clipboardFile(text: string): string | undefined {
  const value = text.trim();
  if (value === "" || value.includes("\n")) return undefined;
  try {
    return existsSync(value) && statSync(value).isFile() ? value : undefined;
  } catch {
    return undefined;
  }
}
