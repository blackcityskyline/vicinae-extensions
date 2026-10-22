/**
 * Russian book names, both directions.
 *
 * Bible Gateway accepts no Russian book name in `?search=` — measured, see
 * `docs/audits/bible.md`. The Russian text itself is available; only the reference
 * has to be typed in English. So a query is translated before it leaves, and a
 * reference built from the page is translated back for display when the version is
 * Russian.
 *
 * The OSIS ids are what `data-osis` carries (`1Sam`, `Ps`, `2Cor`); the English
 * names are what the site accepts as a query. Aliases are the Synodal spellings and
 * the abbreviations people actually type, not a transliteration scheme.
 */

type Entry = readonly [osis: string, english: string, russian: string, aliases: string];

const TABLE: readonly Entry[] = [
  ["Gen", "Genesis", "Бытие", "бытие,быт,ген,бт"],
  ["Exod", "Exodus", "Исход", "исход,исх,исхд"],
  ["Lev", "Leviticus", "Левит", "левит,лев,лвт"],
  ["Num", "Numbers", "Числа", "числа,числ,чис,чсл"],
  ["Deut", "Deuteronomy", "Второзаконие", "второзаконие,втор,втз"],
  ["Josh", "Joshua", "Иисус Навин", "иисус навин,навин,иис нав,ивн"],
  ["Judg", "Judges", "Судьи", "судьи,судей,суд,сд"],
  ["Ruth", "Ruth", "Руфь", "руфь,руф,рф"],
  ["1Sam", "1 Samuel", "1 Царств", "1 царств,1 цар,1сам,1 самуила,1 самуил"],
  ["2Sam", "2 Samuel", "2 Царств", "2 царств,2 цар,2сам,2 самуила,2 самуил"],
  ["1Kgs", "1 Kings", "3 Царств", "3 царств,3 цар,3цар,1 царей"],
  ["2Kgs", "2 Kings", "4 Царств", "4 царств,4 цар,4цар,2 царей"],
  ["1Chr", "1 Chronicles", "1 Паралипоменон", "1 паралипоменон,1 пар,1пар,1 летопись,1 лет"],
  ["2Chr", "2 Chronicles", "2 Паралипоменон", "2 паралипоменон,2 пар,2пар,2 летопись,2 лет"],
  ["Ezra", "Ezra", "Ездра", "ездра,езд"],
  ["Neh", "Nehemiah", "Неемия", "неемия,неем"],
  ["Esth", "Esther", "Есфирь", "есфирь,есф,эсфирь"],
  ["Job", "Job", "Иов", "иов,ив"],
  ["Ps", "Psalms", "Псалтирь", "псалтирь,псалом,псалмы,пс,псал"],
  ["Prov", "Proverbs", "Притчи", "притчи,притч,притча,пр"],
  ["Eccl", "Ecclesiastes", "Екклесиаст", "екклесиаст,еккл,экклезиаст"],
  ["Song", "Song of Solomon", "Песнь Песней", "песнь песней,песни песней,песн,песнь"],
  ["Isa", "Isaiah", "Исаия", "исаия,исаии,исайя,ис"],
  ["Jer", "Jeremiah", "Иеремия", "иеремия,иеремии,иер"],
  ["Lam", "Lamentations", "Плач Иеремии", "плач иеремии,плач,плач иер"],
  ["Ezek", "Ezekiel", "Иезекииль", "иезекииль,иезекииля,иез"],
  ["Dan", "Daniel", "Даниил", "даниил,даниила,дан"],
  ["Hos", "Hosea", "Осия", "осия,ос"],
  ["Joel", "Joel", "Иоиль", "иоиль,иоил,иол"],
  ["Amos", "Amos", "Амос", "амос,ам"],
  ["Obad", "Obadiah", "Авдий", "авдий,авд"],
  ["Jonah", "Jonah", "Иона", "иона,ион"],
  ["Mic", "Micah", "Михей", "михей,мих"],
  ["Nah", "Nahum", "Наум", "наум"],
  ["Hab", "Habakkuk", "Аввакум", "аввакум,авв"],
  ["Zeph", "Zephaniah", "Софония", "софония,соф"],
  ["Hag", "Haggai", "Аггей", "аггей,агг"],
  ["Zech", "Zechariah", "Захария", "захария,зах"],
  ["Mal", "Malachi", "Малахия", "малахия,мал"],
  ["Matt", "Matthew", "Матфея", "матфей,матфея,матф,мф,мат"],
  ["Mark", "Mark", "Марка", "марк,марка,мк,мар"],
  ["Luke", "Luke", "Луки", "лука,луки,лк"],
  ["John", "John", "Иоанна", "иоанн,иоанна,ин,иоан"],
  ["Acts", "Acts", "Деяния", "деяния,деяний,деян"],
  ["Rom", "Romans", "Римлянам", "римлянам,рим,римл"],
  ["1Cor", "1 Corinthians", "1 Коринфянам", "1 коринфянам,1 кор,1кор,1 коринф,1кр"],
  ["2Cor", "2 Corinthians", "2 Коринфянам", "2 коринфянам,2 кор,2кор,2 коринф,2кр"],
  ["Gal", "Galatians", "Галатам", "галатам,гал,глт"],
  ["Eph", "Ephesians", "Ефесянам", "ефесянам,еф,ефес,эф"],
  ["Phil", "Philippians", "Филиппийцам", "филиппийцам,филип,фил"],
  ["Col", "Colossians", "Колоссянам", "колоссянам,кол"],
  ["1Thess", "1 Thessalonians", "1 Фессалоникийцам", "1 фессалоникийцам,1 фес,1фес,1 сол"],
  ["2Thess", "2 Thessalonians", "2 Фессалоникийцам", "2 фессалоникийцам,2 фес,2фес,2 сол"],
  ["1Tim", "1 Timothy", "1 Тимофею", "1 тимофею,1 тим,1тим"],
  ["2Tim", "2 Timothy", "2 Тимофею", "2 тимофею,2 тим,2тим"],
  ["Titus", "Titus", "Титу", "титу,тит"],
  ["Phlm", "Philemon", "Филимону", "филимону,филимон,флм"],
  ["Heb", "Hebrews", "Евреям", "евреям,евр"],
  ["Jas", "James", "Иакова", "иаков,иакова,иак,ик"],
  ["1Pet", "1 Peter", "1 Петра", "1 петр,1 петра,1 пет,1пет"],
  ["2Pet", "2 Peter", "2 Петра", "2 петр,2 петра,2 пет,2пет"],
  ["1John", "1 John", "1 Иоанна", "1 иоанн,1 иоанна,1 ин,1ин"],
  ["2John", "2 John", "2 Иоанна", "2 иоанн,2 иоанна,2 ин,2ин"],
  ["3John", "3 John", "3 Иоанна", "3 иоанн,3 иоанна,3 ин,3ин"],
  ["Jude", "Jude", "Иуды", "иуда,иуды,иуд"],
  ["Rev", "Revelation", "Откровение", "откровение,откр,апокалипсис,апок,отк"],
];

const clean = (value: string): string =>
  value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const ALIASES = new Map<string, string>();
const RUSSIAN_BY_BOOK = new Map<string, string>();

for (const [osis, english, russian, aliases] of TABLE) {
  RUSSIAN_BY_BOOK.set(osis.toLowerCase(), russian);
  for (const alias of aliases.split(",")) {
    const key = clean(alias);
    ALIASES.set(key, english);
    ALIASES.set(key.replace(/ /g, ""), english);
  }
}

const bookFor = (prefix: string): string | undefined => {
  const key = clean(prefix);
  return ALIASES.get(key) ?? ALIASES.get(key.replace(/ /g, ""));
};

/**
 * Translates a Russian book name into the English one the site accepts, leaving
 * the rest of the reference untouched. English input, an unknown book and an empty
 * query are returned as typed; a multi-passage query is translated part by part so
 * the separators survive.
 */
export function normalizeQuery(query: string): string {
  return query
    .split(/([;,])/)
    .map((part, index) => (index % 2 === 1 ? part : normalizeOne(part)))
    .join("");
}

function normalizeOne(part: string): string {
  const lead = part.match(/^\s*/)?.[0] ?? "";
  const tokens = part.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return part;

  // Longest prefix first: "1 Иисус Навин" is a book, "1" alone is a number.
  for (let size = Math.min(tokens.length, 4); size >= 1; size -= 1) {
    const english = bookFor(tokens.slice(0, size).join(" "));
    if (english) {
      return lead + [english, ...tokens.slice(size)].join(" ");
    }
  }
  return part.trim();
}

/** Version strings from `versionOf` end with the abbreviation, e.g. `(RUSV)`. */
export function isRussianVersion(version: string): boolean {
  return /\((RUSV|NRT|ERV-RU)\)/i.test(version);
}

/**
 * Turns the parser's English reference (`John 3:16`, `1Sam 2:3`, `Ps 23:1-Ps 23:6`)
 * back into Russian for a Russian version. Everything from the page is OSIS, so the
 * lookup is on that id — never on a translated string.
 */
export function localizeReference(reference: string, version: string): string {
  if (!isRussianVersion(version)) return reference;
  return reference.replace(
    /(^|[-\u2013\u2014;]\s*)([1-4]?\s?[A-Za-z]+)(?=\s*\d)/g,
    (whole, prefix: string, token: string) => {
      const russian = RUSSIAN_BY_BOOK.get(token.replace(/\s+/g, "").toLowerCase());
      return russian ? `${prefix}${russian}` : whole;
    },
  );
}
