import type { Translation } from "~/api/google";

export type LanguageCode = string;

/**
 * A source language and one or more targets, which is what the reference stores
 * per language set and what every command passes down.
 */
export type LanguageCodeSet = {
  langFrom: LanguageCode;
  langTo: LanguageCode[];
  prioritizeCrossLanguage?: boolean;
};

/** One row of a result list. */
export type Result = Translation;
