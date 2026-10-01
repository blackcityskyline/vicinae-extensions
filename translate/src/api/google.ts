/**
 * Google Translate, the way the `google-translate` extension uses it.
 *
 * The endpoint answers with a positional array of fourteen slots; see
 * `parseTranslation` for what each one is, and `docs/audits/translate.md` for the
 * measurements behind all of it.
 *
 * The three translation shapes below are the reference's: `simpleTranslate` for
 * one target, `multiTranslate` for one row per target, `doubleWayTranslate` to
 * also translate back into the source. What is added on top of the reference is
 * that a result carries the dictionary, the alternatives and the definitions
 * instead of only the string and its pronunciation.
 */

import { spawn } from "node:child_process";

import { isKnownLanguage } from "~/utils/languages";
import type { LanguageCodeSet } from "~/types";
import { translateRequest } from "~/utils/request";

export class GoogleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleError";
  }
}

/** The source language code that means "work it out yourself". */
export const AUTO_DETECT = "auto";

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
  /** The target actually used, which is not always the target asked for. */
  to: string;
  /** What Google thought was meant, when the text had a typo in it. */
  corrected?: string;
  synonyms: SynonymGroup[];
  examples: string[];
  definitions: Definition[];
};

/**
 * Two codes are the same language when their base matches, so `en` and `en-GB`
 * are one language and `ru` is not.
 */
export function isSameLanguage(one: string, two: string): boolean {
  if (!one || !two) return false;
  return one.toLowerCase().split("-")[0] === two.toLowerCase().split("-")[0];
}

export async function translate(text: string, from: string, to: string): Promise<Translation> {
  // Checked here because the endpoint will not: an unknown target language comes
  // back as the original text with a 200, which is indistinguishable from a
  // translation that needed no change.
  if (!isKnownLanguage(to)) throw new GoogleError(`"${to}" is not a language this extension knows.`);

  const request = translateRequest(text, from, to);
  const headers =
    request.method === "POST"
      ? { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" }
      : undefined;

  // The reference sends through a proxy when the `proxy` preference is set, by
  // pulling in undici for its dispatcher. Measured here: that import is inlined
  // by the bundler, and every command goes from 13 kB to 562 kB, which is enough
  // to miss the worker's one-second handshake on three of the six. Node's fetch
  // takes no dispatcher, and an installed extension has no node_modules to
  // resolve undici from at runtime, so the setting is gone rather than shipped at
  // that price. NODE_USE_ENV_PROXY covers the machine-wide case.
  const response = await fetch(request.url, { method: request.method, body: request.body, headers });

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
      const first = Array.isArray(entry[1]) ? (entry[1] as unknown[])[0] : undefined;
      if (!Array.isArray(first)) return undefined;

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

/**
 * One translation, into one target.
 *
 * When the target is the language the text is already in, the reference quietly
 * translates into the second target instead, so a row never shows a translation
 * that says what you already typed.
 */
export async function simpleTranslate(text: string, options: LanguageCodeSet): Promise<Translation> {
  if (!text) return emptyTranslation(text, options);

  let target = options.langTo[0] ?? "en";

  if (options.langFrom !== AUTO_DETECT && isSameLanguage(options.langFrom, target) && options.langTo.length > 1) {
    target = options.langTo[1] ?? target;
  }

  let result = await translate(text, options.langFrom, target);

  if (options.langFrom === AUTO_DETECT && isSameLanguage(result.from, target) && options.langTo.length > 1) {
    const fallback = options.langTo[1] ?? target;
    result = await translate(text, result.from, fallback);
    result.to = fallback;
  }

  return { ...result, to: target };
}

function emptyTranslation(text: string, options: LanguageCodeSet): Translation {
  return {
    text,
    transliteration: "",
    from: options.langFrom,
    to: options.langTo[0] ?? "en",
    synonyms: [],
    examples: [],
    definitions: [],
  };
}

/** One result per target language, in the order the targets were configured. */
export async function multiTranslate(text: string, options: LanguageCodeSet): Promise<Translation[]> {
  if (!text) return [];

  const results = await Promise.all(
    options.langTo.map((langTo) => simpleTranslate(text, { ...options, langTo: [langTo] })),
  );

  // By default the configured order stands. With the preference on, a result that
  // is the same language as the source goes to the bottom.
  if (options.prioritizeCrossLanguage) {
    return results.sort((a, b) => Number(isSameLanguage(a.from, a.to)) - Number(isSameLanguage(b.from, b.to)));
  }

  return results;
}

/** The translation, and the translation back again. */
export async function doubleWayTranslate(text: string, options: LanguageCodeSet): Promise<Translation[]> {
  if (!text) return [];

  if (options.langFrom === AUTO_DETECT) {
    const there = await simpleTranslate(text, options);
    if (!there.from) return [];

    const back = await simpleTranslate(there.text, {
      ...options,
      langFrom: there.to,
      langTo: [there.from],
    });
    return [there, back];
  }

  let target = options.langTo[0] ?? "en";
  if (isSameLanguage(options.langFrom, target) && options.langTo.length > 1) {
    target = options.langTo[1] ?? target;
  }

  return Promise.all([
    simpleTranslate(text, { ...options, langTo: [target] }),
    simpleTranslate(text, { ...options, langFrom: target, langTo: [options.langFrom] }),
  ]);
}

/**
 * Speak the text.
 *
 * The reference downloads the audio to the fixed path `/tmp/translation.mp3` and
 * plays it with `afplay`, which is macOS only, and where two concurrent plays
 * fight over one file. Google serves the audio at a url instead, and `mpv` plays
 * that url directly, so nothing is downloaded and nothing is shared.
 *
 * Measured: `translate_tts` with `client=tw-ob` answers 200 audio/mpeg; without it,
 * a 302. `mpv` on that url exits 0.
 */
export function speak(text: string, langTo: string): void {
  const query = new URLSearchParams({ ie: "UTF-8", tl: langTo, client: "tw-ob", q: text });

  spawn(
    "mpv",
    ["--no-video", "--really-quiet", "--no-terminal", `https://translate.google.com/translate_tts?${query}`],
    { stdio: "ignore", detached: true },
  ).unref();
}