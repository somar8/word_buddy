export type Article = "" | "de" | "het" | "der" | "die" | "das";

export type Example = { nl: string; en: string };
export type Related = { word: string; relation: string; en: string };

/**
 * What the AI builds for one word. meaning_nl and examples[].nl are in the language being learned,
 * meaning_en and .en in the translation language (names kept from the Dutch-only first version).
 */
export type Card = {
  found: boolean;
  word: string;
  article: Article;
  part_of_speech: string;
  forms: string;
  meaning_nl: string;
  meaning_en: string;
  examples: Example[];
  related: Related[];
};

/** A fresh exercise sentence made on the day of a review. */
export type AiTask = {
  sentence: string; // contains exactly one "___"
  answer: string; // the exact form that fills the blank
  en: string; // translation of the full sentence
  distractors: string[]; // wrong options for the multiple-choice task
  lang?: string; // language of `en`; a cached task is only reused when it matches the card's translation_lang
};

export type Word = Omit<Card, "found"> & {
  id: string;
  note: string;
  language: string; // language being learned: nl, de or en
  translation_lang: string; // language of meaning_en and the example translations
  kind: Kind;
  literal: string; // word-for-word meaning (idioms)
  usage: string; // when to use it
  key_word: string; // the part exercises blank out (expressions)
  lapses: number; // times answered "Again"; 2+ = a hard word
  last_reviewed_on: string | null;
  level: string; // level the card was made for (A1-C2)
  drawing: string | null; // the learner's own sketch (PNG data URL)
  stage: number; // 1..6 = next review number, 7 = learned
  due_on: string; // YYYY-MM-DD
  added_on: string; // YYYY-MM-DD
  review_task: AiTask | null;
  review_task_on: string | null;
  created_at: string;
};

export type TaskType =
  | "meaning" // see the word, recall the meaning
  | "type" // see the meaning (in the learned language), type the word
  | "recall" // see the translation, type the word
  | "listen" // hear the word, type it
  | "say" // see the translation, say the word
  | "gap" // fill the gap in a fresh sentence
  | "choose" // pick the word for the gap
  | "write" // write your own sentence
  | "complete"; // complete an expression (its key part is hidden)

/** A single word, or one of the kinds of expression. */
export type Kind = "word" | "phrase" | "idiom" | "saying" | "sentence";
export const EXPRESSION_KINDS: Exclude<Kind, "word">[] = ["phrase", "idiom", "saying", "sentence"];
/** Any value -> a valid expression kind ("Idiom", "proverb", missing… all become something sensible). */
export function toExpressionKind(value: unknown): Exclude<Kind, "word"> {
  const v = typeof value === "string" ? value.trim().toLowerCase() : "";
  if ((EXPRESSION_KINDS as string[]).includes(v)) return v as Exclude<Kind, "word">;
  if (/proverb|saying|spreuk|spruch|sprichwort|gezegde/.test(v)) return "saying";
  if (/idiom|redewendung|uitdrukking/.test(v)) return "idiom";
  if (/sentence|zin|satz/.test(v)) return "sentence";
  return "phrase";
}

export const KIND_LABEL: Record<Kind, string> = {
  word: "Word",
  phrase: "Phrase",
  idiom: "Idiom",
  saying: "Saying",
  sentence: "Sentence",
};

/** What the AI builds for an expression. */
export type ExpressionCard = Omit<Card, "found" | "article" | "forms"> & {
  found: boolean;
  kind: Exclude<Kind, "word">;
  literal: string;
  usage: string;
  key_word: string;
};

export type SentenceCheck = {
  correct: boolean;
  feedback_nl: string;
  feedback_en: string;
  corrected: string;
  translation: string;
};
