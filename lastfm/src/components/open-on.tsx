import React from "react";
import { Action, Icon, open } from "@raycast/api";

import { SITES, siteQuery, siteSearchUrl, type Site } from "~/utils/sites";

/**
 * Open a row somewhere other than Last.fm.
 *
 * One component for every row of every command, so the query is built the same way
 * in all of them: a track or an album carries its artist, an artist is just the
 * name, and a name with an `&` in it cannot become another parameter.
 *
 * `subject` is what to search for. `subtitle` is the extra words an album row
 * contributes — nothing for a track or an artist.
 */
export function OpenOnSites({ subject }: { subject: { artist?: string; name: string } }) {
  const query = siteQuery(subject);

  const action = (site: Site) => (
    <Action
      key={site}
      title={`Open on ${SITES[site]}`}
      icon={Icon.Play}
      onAction={() => void open(siteSearchUrl(site, query))}
    />
  );

  return (
    <>
      {action("youtube")}
      {action("monochrome")}
    </>
  );
}
