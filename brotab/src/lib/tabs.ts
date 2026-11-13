export type Tab = {
  /** brotab's own id, which carries the browser and window: `a.1.17`. */
  id: string;
  title: string;
  url: string;
};

/**
 * `brotab list` prints one tab per line as `id \t title \t url`.
 *
 * Lines that do not carry all three fields are dropped rather than guessed at.
 */
export function parseTabs(stdout: string): Tab[] {
  const tabs: Tab[] = [];

  for (const line of stdout.split("\n")) {
    const [id, title, url] = line.split("\t");
    const tabId = id?.trim();
    const tabTitle = title?.trim();
    const tabUrl = url?.trim();
    if (!tabId || !tabTitle || !tabUrl) continue;
    tabs.push({ id: tabId, title: tabTitle, url: tabUrl });
  }

  return tabs;
}
