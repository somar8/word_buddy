/** Languages you can learn, and the words the app uses for each. */
export const LANGUAGES = ["nl", "de", "en"] as const;
export type Lang = (typeof LANGUAGES)[number];

/** Languages the translations can be shown in (must differ from the language being learned). */
export const SUPPORT_LANGUAGES = {
  en: "English",
  nl: "Dutch",
  de: "German",
  ar: "Arabic",
  fr: "French",
  es: "Spanish",
  tr: "Turkish",
  pl: "Polish",
  uk: "Ukrainian",
} as const;
export type SupportLang = keyof typeof SUPPORT_LANGUAGES;

type LangInfo = {
  name: string; // in English
  native: string;
  flag: string;
  speech: string; // BCP 47 tag for the phone's voice
  articles: string[]; // "" is always allowed too
  articleRule: string; // for the AI prompt
  partsOfSpeech: string[];
  formsRule: string;
  relations: [string, string, string]; // synonym, opposite, family
  placeholder: string;
  exprPlaceholder: string;
  labels: {
    word: string;
    article: string;
    meaning: string;
    inLanguage: string;
    examples: string;
    related: string;
    drawing: string;
    note: string;
    good: string;
    wellDone: string;
    doneToday: string;
  };
};

export const LANG_INFO: Record<Lang, LangInfo> = {
  nl: {
    name: "Dutch",
    native: "Nederlands",
    flag: "🇳🇱",
    speech: "nl-NL",
    articles: ["de", "het"],
    articleRule: '"de" or "het" for nouns, "" for everything else',
    partsOfSpeech: ["zelfstandig naamwoord", "werkwoord", "bijvoeglijk naamwoord", "bijwoord", "voorzetsel", "voegwoord", "uitdrukking", "anders"],
    formsRule: 'nouns -> "meervoud: ..."; verbs -> "verleden tijd: ... · voltooid deelwoord: ..."; adjectives -> "vergrotende trap: ..." if useful; otherwise ""',
    relations: ["synoniem", "tegenovergestelde", "familie"],
    placeholder: "bijv. afspraak",
    exprPlaceholder: "bijv. iemand in de maling nemen",
    labels: {
      word: "Woord", article: "Lidwoord", meaning: "Betekenis", inLanguage: "In het Nederlands",
      examples: "Voorbeelden", related: "Verwante woorden", drawing: "Tekening", note: "Mijn notitie",
      good: "Goed!", wellDone: "Goed gedaan!", doneToday: "Klaar voor vandaag!",
    },
  },
  de: {
    name: "German",
    native: "Deutsch",
    flag: "🇩🇪",
    speech: "de-DE",
    articles: ["der", "die", "das"],
    articleRule: '"der", "die" or "das" for nouns (nominative singular), "" for everything else; write nouns with a capital letter',
    partsOfSpeech: ["Nomen", "Verb", "Adjektiv", "Adverb", "Präposition", "Konjunktion", "Redewendung", "anderes"],
    formsRule: 'nouns -> "Plural: ..."; verbs -> "Präteritum: ... · Perfekt: ..."; adjectives -> "Komparativ: ..." if useful; otherwise ""',
    relations: ["Synonym", "Gegenteil", "Wortfamilie"],
    placeholder: "z. B. Termin",
    exprPlaceholder: "z. B. jemandem die Daumen drücken",
    labels: {
      word: "Wort", article: "Artikel", meaning: "Bedeutung", inLanguage: "Auf Deutsch",
      examples: "Beispiele", related: "Verwandte Wörter", drawing: "Zeichnung", note: "Meine Notiz",
      good: "Gut!", wellDone: "Gut gemacht!", doneToday: "Fertig für heute!",
    },
  },
  en: {
    name: "English",
    native: "English",
    flag: "🇬🇧",
    speech: "en-GB",
    articles: [],
    articleRule: 'always ""',
    partsOfSpeech: ["noun", "verb", "adjective", "adverb", "preposition", "conjunction", "phrase", "other"],
    formsRule: 'nouns -> "plural: ..." if irregular; verbs -> "past: ... · past participle: ..."; adjectives -> "comparative: ..." if useful; otherwise ""',
    relations: ["synonym", "opposite", "word family"],
    placeholder: "e.g. appointment",
    exprPlaceholder: "e.g. to pull someone's leg",
    labels: {
      word: "Word", article: "Article", meaning: "Meaning", inLanguage: "In English",
      examples: "Examples", related: "Related words", drawing: "Drawing", note: "My note",
      good: "Good!", wellDone: "Well done!", doneToday: "Done for today!",
    },
  },
};

export function toLang(value: unknown): Lang | null {
  return typeof value === "string" && (LANGUAGES as readonly string[]).includes(value) ? (value as Lang) : null;
}

export function toSupport(value: unknown): SupportLang | null {
  return typeof value === "string" && value in SUPPORT_LANGUAGES ? (value as SupportLang) : null;
}

/** English is the default translation language; when learning English, Dutch is. */
export function defaultSupport(lang: Lang): SupportLang {
  return lang === "en" ? "nl" : "en";
}
