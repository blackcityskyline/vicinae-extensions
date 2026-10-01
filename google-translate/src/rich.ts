/**
 * What the endpoint sends that the reference throws away.
 *
 * `translate()` is called with `raw: true` upstream, so the whole response is
 * already in hand — a positional array of fourteen slots. The reference reads slot 0
 * for the translation and slot 0's second entry for the transliteration, and
 * ignores the rest. Measured on `q=hello&sl=en&tl=ru` with the full `dt` list:
 *
 *   [1]  dictionary — [[part of speech, [synonyms], [[synonym, [english], null, score]], …], …]
 *   [5]  alternative renderings — [[original, null, [[translated, null, …], …], …], …]
 *   [7]  the correction when the text had a typo — [markup, plain text, indices]
 *   [12] definitions in English — [[part of speech, [[definition, id, example], …], original, score], …]
 *
 * Asking for fewer `dt` types still answers 200, just shorter, so nothing would
 * ever report what was missing. Every slot is therefore optional here: a
 * translated paragraph comes back with three slots and no dictionary, which is the
 * normal case and must not throw.
 */

export type Synonym = { word: string; score: number };
export type SynonymGroup = { partOfSpeech: string; words: Synonym[] };
export type Definition = { partOfSpeech: string; text: string; example?: string };

export type RichResult = {
  corrected?: string;
  synonyms: SynonymGroup[];
  examples: string[];
  definitions: Definition[];
};

export const NOTHING: RichResult = { synonyms: [], examples: [], definitions: [] };

export function parseRich(raw: unknown): RichResult {
  if (!Array.isArray(raw)) return NOTHING;

  const list = (index: number): unknown[] => (Array.isArray(raw[index]) ? (raw[index] as unknown[]) : []);
  const text = (value: unknown): string => (typeof value === "string" ? value : "");

  // Slot 1. Synonyms ordered by the score Google gives them, groups ordered by the
  // strongest word in the group, so the list reads strongest first.
  const synonyms: SynonymGroup[] = list(1)
    .filter(Array.isArray)
    .map((group) => {
      const entry = group as unknown[];
      const words = (Array.isArray(entry[2]) ? (entry[2] as unknown[]) : [])
        .filter(Array.isArray)
        .map((word) => {
          const row = word as unknown[];
          return { word: text(row[0]), score: Number(row[3]) || 0 };
        })
        .filter((word) => word.word)
        .sort((a, b) => b.score - a.score);

      return { partOfSpeech: text(entry[0]), words };
    })
    .filter((group) => group.words.length > 0)
    .sort((a, b) => (b.words[0]?.score ?? 0) - (a.words[0]?.score ?? 0));

  // Slot 5.
  const examples = list(5)
    .filter(Array.isArray)
    .flatMap((group) => {
      const alternatives = (group as unknown[])[2];
      return (Array.isArray(alternatives) ? (alternatives as unknown[]) : [])
        .filter(Array.isArray)
        .map((alternative) => text((alternative as unknown[])[0]))
        .filter(Boolean);
    });

  // Slot 12.
  const definitions: Definition[] = list(12)
    .filter(Array.isArray)
    .map((group) => {
      const entry = group as unknown[];
      const first = Array.isArray(entry[1]) ? (entry[1] as unknown[])[0] : undefined;
      if (!Array.isArray(first)) return undefined;

      const definition: Definition = { partOfSpeech: text(entry[0]), text: text(first[0]) };
      const example = text(first[2]);
      if (example) definition.example = example;
      return definition;
    })
    .filter((definition): definition is Definition => Boolean(definition?.text));

  // Slot 7 is [markup, plain text, changed indices] when filled. The reference
  // reads index 0 and strips the markup, then looks for a boolean at index 5,
  // which does not exist in a three-element body, so its autocorrect flag is
  // always false. The plain text is right there.
  const correction = list(7);
  const corrected = text(correction[1]) || text(correction[0]).replace(/<[^>]*>/g, "") || undefined;

  return {
    ...NOTHING,
    corrected: corrected || undefined,
    synonyms,
    examples,
    definitions,
  };
}

/** One line per group, for a form field that takes plain text. */
export function synonymsAsText(groups: SynonymGroup[]): string {
  return groups
    .map((group) => {
      const part = group.partOfSpeech ? `${group.partOfSpeech}: ` : "";
      return `${part}${group.words.map((word) => word.word).join(", ")}`;
    })
    .join("\n");
}

export function definitionsAsText(definitions: Definition[]): string {
  return definitions
    .map((entry) => {
      const part = entry.partOfSpeech ? `${entry.partOfSpeech}: ` : "";
      const example = entry.example ? ` — ${entry.example}` : "";
      return `${part}${entry.text}${example}`;
    })
    .join("\n");
}