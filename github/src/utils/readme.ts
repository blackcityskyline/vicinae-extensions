/**
 * README decoding and truncation.
 *
 * Pure, so `test/parsing.test.ts` can check it headlessly. The fetch lives in
 * `src/api/readme.ts`.
 */

/**
 * How much markdown to hand the renderer.
 *
 * The `Detail` markdown renderer is documented as very bare bones, and a
 * repository README is usually a few kilobytes but occasionally megabytes.
 * Truncating keeps the view responsive; the reader is told it happened rather
 * than being shown a document that silently stops mid-sentence.
 */
export const MAX_README_CHARS = 120_000;

/**
 * Decode the base64 payload from `GET /repos/{owner}/{repo}/readme`.
 *
 * GitHub wraps that base64 across lines, which `Buffer.from` ignores. Anything
 * undecodable yields an empty string rather than throwing, so a bad payload
 * shows the caller's "no README" state instead of a crashed view.
 */
export function decodeReadme(content: string, encoding: string): string {
  if (encoding !== "base64") return content;
  return Buffer.from(content, "base64").toString("utf8");
}

export function truncateReadme(markdown: string): { markdown: string; truncated: boolean } {
  if (markdown.length <= MAX_README_CHARS) return { markdown, truncated: false };

  return {
    markdown: `${markdown.slice(0, MAX_README_CHARS)}\n\n---\n\n_This README was truncated for display. Open it on GitHub to read the rest._`,
    truncated: true,
  };
}

/** The file name GitHub reports, minus the directory, for the navigation title. */
export function readmeTitle(fileName: string, fullName: string): string {
  const base = fileName.split("/").pop() ?? fileName;
  return base.length > 0 ? `${fullName} · ${base}` : fullName;
}
