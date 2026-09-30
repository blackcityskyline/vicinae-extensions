import { CARD_KEY_LABEL } from "~/constants/labels";
import { CARD_BRANDS, Card, CardBrand } from "~/types/vault";

const BASE_CARD_IMAGE_URL = "https://vault.bitwarden.com/images";

const CARD_BRANDS_TO_IMAGE_URL_MAP: Partial<Record<CardBrand, string>> = {
  [CARD_BRANDS.VISA]: `${BASE_CARD_IMAGE_URL}/visa-light.png`,
  [CARD_BRANDS.MASTERCARD]: `${BASE_CARD_IMAGE_URL}/mastercard-light.png`,
  [CARD_BRANDS.AMEX]: `${BASE_CARD_IMAGE_URL}/amex-light.png`,
  [CARD_BRANDS.DISCOVER]: `${BASE_CARD_IMAGE_URL}/discover-light.png`,
  [CARD_BRANDS.DINERS_CLUB]: `${BASE_CARD_IMAGE_URL}/diners_club-light.png`,
  [CARD_BRANDS.JCB]: `${BASE_CARD_IMAGE_URL}/jcb-light.png`,
  [CARD_BRANDS.MAESTRO]: `${BASE_CARD_IMAGE_URL}/maestro-light.png`,
  [CARD_BRANDS.UNION_PAY]: `${BASE_CARD_IMAGE_URL}/union_pay-light.png`,
  [CARD_BRANDS.RU_PAY]: `${BASE_CARD_IMAGE_URL}/ru_pay-light.png`,
};

const CARD_KEY_LABEL_KEYS = Object.keys(CARD_KEY_LABEL);

/** Sorts card fields into the order they appear on Bitwarden's web vault form. */
export function cardBitwardenPageFieldOrderSorter([a]: string | [string, any], [b]: string | [string, any]) {
  const aIndex = CARD_KEY_LABEL_KEYS.indexOf((Array.isArray(a) ? a[0] : a) as keyof Card);
  const bIndex = CARD_KEY_LABEL_KEYS.indexOf((Array.isArray(b) ? b[0] : b) as keyof Card);
  return aIndex - bIndex;
}

export function getCardImageUrl(brand: CardBrand): string | undefined {
  return CARD_BRANDS_TO_IMAGE_URL_MAP[brand];
}
