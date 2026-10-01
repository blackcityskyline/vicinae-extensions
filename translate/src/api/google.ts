import { isKnownLanguage } from "~/utils/languages";
import { translateRequest } from "~/utils/request";

/**
 * Google's own endpoint, and the shape of what it answers.
 *
 * The response is a positional array with fourteen slots, most of which are empty
 * unless the matching `dt` was asked for. Slot meanings are pinned by the checks
 * in `test/parse.test.ts`, against bodies captured from the live endpoint.
 */

export class GoogleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleError";
  }
}

export type Synonym = { word: string; score: number };
export type SynonymGroup = { partOfSpeech: string; words: Synonym[] };
export type Definition = { partOfSpeech: string; text: string; example?: string };

export type Translation = {
  text: string;
  /** Latin spelling of a Cyrillic answer, and the reverse. */
  transliteration?: string;
  /** IPA, when Google bothers. */
  phonetic?: string;
  /** What Google decided the source was, which is not what was asked for. */
  from: string;
  to: string;
  /** What Google thought was meant, when the text had a typo in it. */
  corrected?: string;
  synonyms: SynonymGroup[];
  examples: string[];
  definitions: Definition[];
};

export async function translate(text: string, from: string, to: string): Promise<Translation> {
  // Checked here because the endpoint will not: an unknown target language comes
  // back as the original text with a 200, which is indistinguishable from a
  // translation that needed no change.
  if (!isKnownLanguage(to)) throw new GoogleError(`"${to}" is not a language this extension knows.`);

  const request = translateRequest(text, from, to);

  const response = await fetch(request.url, {
    method: request.method,
    body: request.body,
    headers:
      request.method === "POST"
        ? { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" }
        : undefined,
  });

  if (!response.ok) {
    // Measured: a refused request answers Google's HTML error page, not json.
    const detail = (await response.text()).match(/<title>([^<]*)<\/title>/)?.[1];
    throw new GoogleError(
      `Google answered ${response.status}${detail ? `, ${detail}` : ""}. Try again in a moment.`,
    );
  }

  return parseTranslation(await response.json(), from, to);
}

/**
 * Turn a response body into a translation, or say why it is not one.
 *
 * Every slot is optional. A translation of a whole paragraph comes back with
 * three slots and nothing else, which is the normal case and must not throw.
 */
export function parseTranslation(body: unknown, requestedFrom: string, to: string): Translation {
  if (!Array.isArray(body)) {
    const seen = typeof body === "string" ? body.slice(0, 60) : JSON.stringify(body)?.slice(0, 60);
    throw new GoogleError(`Google answered with something that is not a translation: ${seen}`);
  }

  const slot = (index: number): unknown => body[index];
  const list = (index: number): unknown[] => (Array.isArray(slot(index)) ? (slot(index) as unknown[]) : []);
  const text = (value: unknown): string => (typeof value === "string" ? value : "");

  // Slot 0: one entry per segment, [translated, original, …]. Exactly one segment
  // carries the pronunciation, at indices 2 and 3, so take the first that has it.
  const segments = list(0).filter(Array.isArray) as unknown[][];
  const spoken = segments.find((segment) => typeof segment[2] === "string");

  // Slot 1: [[part of speech, [synonyms], [[synonym, [english], null, score], …]], …]
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

  // Slot 5: [[original, null, [[translated, null, …], …], …], …]
  const examples = list(5)
    .filter(Array.isArray)
    .flatMap((group) => {
      const alternatives = (group as unknown[])[2];
      return (Array.isArray(alternatives) ? (alternatives as unknown[]) : [])
        .filter(Array.isArray)
        .map((alternative) => text((alternative as unknown[])[0]))
        .filter(Boolean);
    });

  // Slot 12: [[part of speech, [[definition, id, example sentence], …], original, score], …]
  const definitions: Definition[] = list(12)
    .filter(Array.isArray)
    .map((group) => {
      const entry = group as unknown[];
      const first = Array.isArray(entry[1]) ? ((entry[1] as unknown[])[0] as unknown[]) : undefined;
      if (!first) return undefined;

      const definition: Definition = { partOfSpeech: text(entry[0]), text: text(first[0]) };
      const example = text(first[2]);
      if (example) definition.example = example;
      return definition;
    })
    .filter((definition): definition is Definition => Boolean(definition?.text));

  // Slot 7, when filled, is the correction: [markup, plain text, changed indices].
  // Upstream reads index 0 and strips the markup, then looks for a boolean at
  // index 5 — which does not exist in a three-element body, so its
  // "autocorrected" flag is always false. The plain text is right there.
  const correction = list(7);
  const corrected = text(correction[1]) || text(correction[0]).replace(/<[^>]*>/g, "") || undefined;

  const detected = text(slot(2));

  return {
    text: segments.map((segment) => text(segment[0])).join(""),
    transliteration: text(spoken?.[2]) || undefined,
    phonetic: text(spoken?.[3]) || undefined,
    from: detected || requestedFrom,
    to,
    corrected,
    synonyms,
    examples,
    definitions,
  };
}