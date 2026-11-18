/**
 * The detail pane's markdown: the snapshot of the tab, and under it the whole
 * title. A row cuts the title at the pane width, and two tabs of one site differ
 * only in their title.
 */

/** Punctuation that would turn a title into emphasis, a link or a heading. */
const MARKDOWN = /[\\`*_{}[\]()#!|<>~]/g;

export function escapeTitle(title: string): string {
  return title.replace(MARKDOWN, "\\$&");
}

export type PreviewTab = { title: string; url: string };

export function previewMarkdown(tab: PreviewTab, source: string | null, error: string | null): string {
  const heading = `**${escapeTitle(tab.title || tab.url)}**`;
  if (error !== null) return `Could not screenshot the page: ${escapeTitle(error)}\n\n---\n\n${heading}`;
  if (source === null) return heading;
  return `![](${source})\n\n${heading}`;
}
