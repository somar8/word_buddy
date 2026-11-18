import { defaultSupport, LANG_INFO, LANGUAGES, SUPPORT_LANGUAGES, toLang, toSupport, type Lang, type SupportLang } from "./languages";
import { englishFirst, toLevel, type Level } from "./levels";

export type ShowTranslation = "auto" | "always" | "tap";
export type SpeechSpeed = "slow" | "normal";

/** A user's preferences, kept in their Supabase Auth user metadata. */
export type Prefs = {
  language: Lang; // language being learned
  levels: Partial<Record<Lang, Level>>; // one level per language
  level: Level | null; // level for `language`; null until chosen
  supports: Partial<Record<Lang, SupportLang>>; // translation language, one per learning language
  support: SupportLang; // translation language for `language`
  showTranslation: ShowTranslation;
  speech: SpeechSpeed;
};

type Meta = Record<string, unknown> | null | undefined;

export function prefsFrom(meta: Meta): Prefs {
  const m = meta ?? {};
  const language = toLang(m.language) ?? "nl";
  const levels: Partial<Record<Lang, Level>> = {};
  const raw = (m.levels ?? {}) as Record<string, unknown>;
  for (const l of LANGUAGES) {
    const v = toLevel(raw[l]);
    if (v) levels[l] = v;
  }
  // Accounts from before languages existed have a single "level" for Dutch.
  if (!levels.nl && toLevel(m.level)) levels.nl = toLevel(m.level)!;
  // Each learning language has its own translation language ("translations": { "de": "nl", ... }).
  const supports: Partial<Record<Lang, SupportLang>> = {};
  const rawSupports = (m.translations ?? {}) as Record<string, unknown>;
  for (const l of LANGUAGES) {
    const v = toSupport(rawSupports[l]);
    if (v && v !== l) supports[l] = v;
  }
  // Accounts from before this had one "translate_to" for the language they were learning.
  const legacy = toSupport(m.translate_to);
  if (!supports[language] && legacy && legacy !== language) supports[language] = legacy;
  const support = supports[language] ?? defaultSupport(language);
  const show = m.show_translation;
  return {
    language,
    levels,
    level: levels[language] ?? null,
    supports,
    support,
    showTranslation: show === "always" || show === "tap" ? show : "auto",
    speech: m.speech === "slow" ? "slow" : "normal",
  };
}

/** The user metadata to save for these preferences. */
export function metaFor(p: Omit<Prefs, "level">): Record<string, unknown> {
  const support = p.support === p.language ? defaultSupport(p.language) : p.support;
  return {
    language: p.language,
    levels: p.levels,
    level: p.levels[p.language] ?? null,
    translations: { ...p.supports, [p.language]: support },
    translate_to: support, // the current language's translation language (mirrored into profiles)
    show_translation: p.showTranslation,
    speech: p.speech,
  };
}

/** Whether translations are visible straight away (otherwise behind a "Show …" button). */
export function translationFirst(p: Pick<Prefs, "showTranslation" | "level">): boolean {
  if (p.showTranslation === "always") return true;
  if (p.showTranslation === "tap") return false;
  return p.level ? englishFirst(p.level) : false;
}

export function supportName(p: Pick<Prefs, "support">): string {
  return SUPPORT_LANGUAGES[p.support];
}

export function langInfo(p: Pick<Prefs, "language">) {
  return LANG_INFO[p.language];
}

/** Switches the learning language; the level and translation language follow that language's own settings. */
export function withLanguage<P extends Omit<Prefs, "level">>(p: P, language: Lang): P {
  return { ...p, language, support: p.supports[language] ?? defaultSupport(language) };
}

/** Sets the translation language for the current learning language only. */
export function withSupport<P extends Omit<Prefs, "level">>(p: P, support: SupportLang): P {
  return { ...p, support, supports: { ...p.supports, [p.language]: support } };
}

export function supportLabel(code: string | null | undefined): string {
  return SUPPORT_LANGUAGES[(code ?? "en") as SupportLang] ?? "English";
}
