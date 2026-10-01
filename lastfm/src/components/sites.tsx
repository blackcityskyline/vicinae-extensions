import { Action, Icon, open } from "@vicinae/api";

import { siteLabel, siteSearchUrl, type Site } from "~/utils/sites";

/**
 * Searches a site for the artist and title, and opens it in the default browser.
 * One component for every site so the query is built the same way in all the
 * places it appears, and so a new site is one line in `utils/sites.ts`.
 *
 * monochrome.tf opened on `.st`, not `.tf`: `.tf` answers 503 with a page whose
 * entire content is a meta refresh to `.st`. Its own canonical tags still say
 * `.tf`, so the old host is still all over the app.
 */
export function OpenOnSite({ site, artist, name }: { site: Site; artist?: string; name: string }) {
  return (
    <Action
      title={`Open on ${siteLabel(site)}`}
      icon={Icon.Play}
      onAction={() => void open(siteSearchUrl(site, { artist, name }))}
    />
  );
}