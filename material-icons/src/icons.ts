/**
 * Google's icon catalogue: one request to `fonts.google.com/metadata/icons`, then
 * everything is local. The response begins with an anti-JSON-hijacking line
 * (`)]}'`), so the first line is removed before parsing.
 *
 * Pure on purpose: the grid, the list and the download form all read these
 * shapes, and the test needs them without a network.
 */

export type MaterialIconAsset = {
  family: string;
  url: string;
};

export type MaterialIcon = {
  categories: string;
  codepoint: string;
  name: string;
  version: number;
  tags: string[];
  assets: MaterialIconAsset[];
};

export enum MaterialIconStyle {
  Filled,
  Outlined,
  Rounded,
  Sharp,
  "Two Tone",
}

export const MATERIAL_STYLES: { title: string; value: MaterialIconStyle }[] = [
  { title: "Filled", value: MaterialIconStyle.Filled },
  { title: "Outlined", value: MaterialIconStyle.Outlined },
  { title: "Rounded", value: MaterialIconStyle.Rounded },
  { title: "Sharp", value: MaterialIconStyle.Sharp },
  { title: "Two Tone", value: MaterialIconStyle["Two Tone"] },
];

type Metadata = {
  host: string;
  asset_url_pattern: string;
  families: string[];
  icons: {
    categories: string[];
    codepoint: number;
    name: string;
    sizes_px: number[];
    tags: string[];
    version: number;
  }[];
};

export function parseMetadata(body: string): MaterialIcon[] {
  const json = JSON.parse(body.replace(/^[^\n]*\n/, "")) as Metadata;
  const base = (json.host.startsWith("http") ? json.host : `https://${json.host}`).replace(/\/$/, "");

  return json.icons.map<MaterialIcon>((icon) => {
    const assets = json.families.map((family) => {
      const path = json.asset_url_pattern
        .replace("{family}", family.toLowerCase().replace(/\W+/g, ""))
        .replace("{icon}", icon.name)
        .replace("{version}", String(icon.version))
        .replace("{asset}", `${icon.sizes_px[0] ?? 24}px`);

      return { family, url: `${base}/${path.replace(/^\//, "")}.svg` };
    });

    return {
      categories: icon.categories.join(", "),
      codepoint: icon.codepoint.toString(16),
      name: icon.name,
      tags: icon.tags,
      version: icon.version,
      assets,
    };
  });
}

/** The asset for a style, or the first one when the API grows a family this build does not know. */
export function assetUrl(icon: MaterialIcon, style: MaterialIconStyle): string {
  return icon.assets[style]?.url ?? icon.assets[0]?.url ?? "";
}

/** A subsequence match: `alrm` finds `alarm`, which plain substring search would not. */
export function fuzzyMatch(needle: string, haystack: string): boolean {
  const query = needle.toLowerCase();
  if (query.length === 0) return true;

  let matched = 0;
  for (const character of haystack.toLowerCase()) {
    if (character === query[matched]) matched += 1;
    if (matched === query.length) return true;
  }

  return false;
}

/** Name matches first, then tag matches, so an exact-looking hit is not buried. */
export function searchIcons(icons: MaterialIcon[], query: string): MaterialIcon[] {
  const trimmed = query.trim();
  if (trimmed.length === 0) return icons;

  const named: MaterialIcon[] = [];
  const tagged: MaterialIcon[] = [];

  for (const icon of icons) {
    if (fuzzyMatch(trimmed, icon.name)) named.push(icon);
    else if (icon.tags.some((tag) => fuzzyMatch(trimmed, tag))) tagged.push(icon);
  }

  return [...named, ...tagged];
}

export type DownloadPlatform = "Web" | "Android" | "IOS";
export type DownloadFormat = "PNG" | "SVG";

/** The file name Google uses under the icon's version, e.g. `black-24dp.zip` or `24px.svg`. */
export function downloadAsset(
  platform: DownloadPlatform,
  format: DownloadFormat,
  color: string,
  size: string,
): string | undefined {
  const tone = color.toLowerCase();

  switch (platform) {
    case "Web":
      return format === "SVG" ? "24px.svg" : `${tone}-${size}dp.zip`;
    case "Android":
      return `${tone}-android.zip`;
    case "IOS":
      return `${tone}-ios.zip`;
    default:
      return undefined;
  }
}

export function downloadUrl(icon: MaterialIcon, asset: string): string {
  return `https://fonts.gstatic.com/s/i/materialicons/${icon.name}/v${icon.version}/${asset}`;
}
