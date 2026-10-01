import type { Translation } from "~/api/google";
import { languageName } from "~/utils/languages";

/**
 * What one row shows in the detail panel, and what the list filter can see.
 *
 * Upstream shows the translation twice — once as the title, once as the markdown —
 * and never shows the text that was typed. Both are fixed here.
 */

/**
 * The detail for one translation.
 *
 * Sections that have nothing to say are left out entirely, rather than rendered
 * empty: a translated paragraph has no dictionary, no examples and no
 * definitions, and that is the normal case.
 */
export function detailMarkdown(source: string, translation: Translation): string {
  const blocks: string[] = [`# ${translation.text}`];

  // Transliteration and IPA joined only when both are there, so nothing is left
  // dangling next to a missing one.
  const spoken = [translation.transliteration, translation.phonetic].filter(Boolean).join(" · ");
  if (spoken) blocks.push(`_${spoken}_`);

  const route = languageName(translation.from) + ` → ${languageName(translation.to)}`;
  blocks.push(source.trim() ? `**${source}**  \n${route}` : route);

  if (translation.corrected) blocks.push(`> Did you mean **${translation.corrected}**?`);

  if (translation.synonyms.length > 0) {
    blocks.push(
      ["**Synonyms**", ...translation.synonyms.map(alternatives)].join("\n"),
    );
  }

  if (translation.examples.length > 0) {
    blocks.push(["**Examples**", ...translation.examples.map((example) => `- ${example}`)].join("\n"));
  }

  if (translation.definitions.length > 0) {
    blocks.push(["**Definitions**", ...translation.definitions.map(definition)].join("\n"));
  }

  return blocks.join("\n\n");
}

function alternatives(group: Translation["synonyms"][number]): string {
  const part = group.partOfSpeech ? `*${group.partOfSpeech}*: ` : "";
  return `- ${part}${group.words.map((word) => word.word).join(", ")}`;
}

function definition(entry: Translation["definitions"][number]): string {
  const part = entry.partOfSpeech ? `*${entry.partOfSpeech}*: ` : "";
  const example = entry.example ? ` — “${entry.example}”` : "";
  return `- ${part}${entry.text}${example}`;
}

/**
 * What the list filter matches against.
 *
 * This is the whole reason the list is usable: the filter is applied to the rows
 * while the same text is what is being typed into the search bar, so the source
 * has to be in here or every row disappears the moment a word is typed. Upstream
 * passes no `keywords` at all, which empties the list for exactly that reason.
 */
export function keywordsFor(source: string, translation: Translation): string[] {
  const words = [
    source,
    translation.text,
    translation.transliteration ?? "",
    translation.phonetic ?? "",
    translation.corrected ?? "",
    ...translation.synonyms.flatMap((group) => group.words.map((word) => word.word)),
    ...translation.examples,
    ...translation.definitions.map((entry) => entry.text),
  ];

  return [...new Set(words.map((word) => word.trim()).filter(Boolean))];
}