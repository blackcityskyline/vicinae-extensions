/** A preset is the text the user typed, e.g. "5m Tea", parsed like the search bar. */
export interface Preset {
  text: string;
  /** False for an entry that only exists in the Timer Presets preference. */
  saved: boolean;
}

/** Trim, collapse runs of spaces, drop blanks and case-insensitive duplicates. */
function clean(entries: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of entries) {
    const text = entry.trim().replace(/\s+/g, " ");
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    result.push(text);
  }
  return result;
}

/** The preference list first, then the saved ones; the same text appears once. */
export function presetList(preference: string, saved: readonly string[]): Preset[] {
  const stored = clean(saved);
  const keys = new Set(stored.map((entry) => entry.toLowerCase()));
  return clean([...preference.split(","), ...stored]).map((text) => ({ text, saved: keys.has(text.toLowerCase()) }));
}

export function addPreset(saved: readonly string[], text: string): string[] {
  return clean([...saved, text]);
}

export function dropPreset(saved: readonly string[], text: string): string[] {
  const key = text.trim().toLowerCase();
  return saved.filter((entry) => entry.trim().toLowerCase() !== key);
}
