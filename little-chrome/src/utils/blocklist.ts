/** Pages and whole sites hidden from the suggestion list. Browser history is never touched. */
export interface Blocklist {
  urls: string[];
  hosts: string[];
}

export const emptyBlocklist = (): Blocklist => ({ urls: [], hosts: [] });

export function isBlocked(url: string, blocklist: Blocklist): boolean {
  if (blocklist.urls.includes(url)) return true;
  const host = hostOfHttp(url);
  return host !== undefined && blocklist.hosts.includes(host);
}

/** Only an http(s) URL has a host a site entry could match, so `mailto:` is never hidden by one. */
export function hostOfHttp(url: string): string | undefined {
  try {
    const { protocol, host } = new URL(url);
    return (protocol === "https:" || protocol === "http:") && host ? host : undefined;
  } catch {
    return undefined;
  }
}

export function withoutUrl(blocklist: Blocklist, url: string): Blocklist {
  return { ...blocklist, urls: blocklist.urls.filter((entry) => entry !== url) };
}

export function withoutHost(blocklist: Blocklist, host: string): Blocklist {
  return { ...blocklist, hosts: blocklist.hosts.filter((entry) => entry !== host) };
}
