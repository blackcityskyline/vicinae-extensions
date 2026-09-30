import {  } from "@vicinae/api";
import { Icon } from "~/utils/icons";
import { ITEM_TYPE_TO_LABEL } from "~/constants/labels";
import { Item } from "~/types/vault";

/** Bitwarden's icon server, used for favicons of login items. */
export function faviconUrl(url: string): string {
  try {
    const domain = new URL(url).hostname;
    if (!domain) return Icon.Globe01;
    return `https://icons.bitwarden.net/${domain}/icon.png`;
  } catch {
    return Icon.Globe01;
  }
}

/**
 * Extra terms Vicinae's builtin fuzzy filter should rank against.
 *
 * Returning `undefined` keeps the component uncontrolled and lets the builtin
 * filter run, rather than re-implementing fuzzy matching in JS.
 */
export function getSearchKeywords(item: Item): string[] {
  const keywords: (string | null | undefined)[] = [
    item.name,
    item.login?.username,
    ...(item.login?.uris?.map(({ uri }) => uri) ?? []),
    item.card?.brand,
    item.card?.number,
    item.identity?.email,
    ITEM_TYPE_TO_LABEL[item.type],
  ];
  return keywords.filter((value): value is string => !!value);
}
