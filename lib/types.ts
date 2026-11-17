export type Article = "" | "de" | "het";

export type Example = { nl: string; en: string };
export type Related = { word: string; relation: string; en: string };

/** What the AI builds for one word. */
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
  en: string; // English translation of the full sentence
  distractors: string[]; // wrong options for the multiple-choice task
};

export type Word = Omit<Card, "found"> & {
  id: string;
  note: string;
  stage: number; // 1..6 = next review number, 7 = learned
  due_on: string; // YYYY-MM-DD
  added_on: string; // YYYY-MM-DD
  review_task: AiTask | null;
  review_task_on: string | null;
  created_at: string;
};

export type TaskType = "meaning" | "type" | "gap" | "choose" | "write";

export type SentenceCheck = {
  correct: boolean;
  feedback_nl: string;
  feedback_en: string;
  corrected: string;
};
