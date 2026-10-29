import { LocalStorage } from "@vicinae/api";

const KEY = "iskra_ocr_lang";
// Where the language was saved before the key was renamed.
const LEGACY_KEY = "selected_ocr_language";
const DEFAULT_LANGUAGE = "eng";

/** Tesseract language codes this extension offers, with the name shown for each. */
export const OCR_LANGUAGES: { code: string; name: string }[] = [
	{ code: "eng", name: "English" },
	{ code: "fra", name: "French" },
	{ code: "ita", name: "Italian" },
	{ code: "deu", name: "German" },
	{ code: "spa", name: "Spanish" },
	{ code: "por", name: "Portuguese" },
	{ code: "chi_sim", name: "Chinese (Simplified)" },
	{ code: "chi_tra", name: "Chinese (Traditional)" },
	{ code: "jpn", name: "Japanese" },
	{ code: "kor", name: "Korean" },
	{ code: "rus", name: "Russian" },
	{ code: "ara", name: "Arabic" },
	{ code: "hin", name: "Hindi" },
	{ code: "nld", name: "Dutch" },
	{ code: "pol", name: "Polish" },
	{ code: "tur", name: "Turkish" },
	{ code: "ukr", name: "Ukrainian" },
	{ code: "vie", name: "Vietnamese" },
	{ code: "swe", name: "Swedish" },
	{ code: "dan", name: "Danish" },
	{ code: "fin", name: "Finnish" },
	{ code: "nor", name: "Norwegian" },
	{ code: "hun", name: "Hungarian" },
	{ code: "ces", name: "Czech" },
	{ code: "ron", name: "Romanian" },
	{ code: "ell", name: "Greek" },
	{ code: "heb", name: "Hebrew" },
	{ code: "ind", name: "Indonesian" },
	{ code: "msa", name: "Malay" },
	{ code: "tha", name: "Thai" },
];

// An absent key is null at runtime, not undefined, so `||` rather than a default.
export const getOcrLanguage = async (): Promise<string> =>
	(await LocalStorage.getItem<string>(KEY)) ||
	(await LocalStorage.getItem<string>(LEGACY_KEY)) ||
	DEFAULT_LANGUAGE;

export const saveOcrLanguage = (code: string): Promise<void> =>
	LocalStorage.setItem(KEY, code);
