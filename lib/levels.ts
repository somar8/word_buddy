/** CEFR levels. Each user picks one at sign-up; it shapes every AI card, sentence and check. */
export const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type Level = (typeof LEVELS)[number];

/** Used for accounts made before levels existed, until the user picks one. */
export const DEFAULT_LEVEL: Level = "B1";

export const LEVEL_INFO: Record<Level, { name: string; can: string; prompt: string }> = {
  A1: {
    name: "Beginner",
    can: "You know a few words and very short sentences.",
    prompt:
      "absolute beginner. Use only very common words, the present tense and sentences of at most 7 words. Explain meanings in the simplest Dutch possible (at most 8 words).",
  },
  A2: {
    name: "Elementary",
    can: "You manage simple everyday things: shopping, family, work.",
    prompt:
      "elementary learner. Use common everyday words, the present and perfect tense and short sentences of at most 10 words. Explain meanings in simple Dutch (at most 10 words).",
  },
  B1: {
    name: "Intermediate",
    can: "You follow everyday conversations and can talk about most topics.",
    prompt:
      "intermediate learner. Use natural everyday Dutch with common tenses and some subordinate clauses. Explain meanings in simple Dutch (at most 15 words).",
  },
  B2: {
    name: "Upper intermediate",
    can: "You read the news and discuss abstract topics with some ease.",
    prompt:
      "upper-intermediate learner. Use natural, varied Dutch with subordinate clauses, separable verbs and common idioms. Explain meanings in clear Dutch (at most 18 words).",
  },
  C1: {
    name: "Advanced",
    can: "You use Dutch flexibly at work and in study.",
    prompt:
      "advanced learner. Use rich, idiomatic Dutch, including formal and informal registers and subtle differences in meaning. Explain meanings precisely in Dutch (at most 20 words).",
  },
  C2: {
    name: "Mastery",
    can: "You understand almost everything and want nuance and style.",
    prompt:
      "near-native learner. Use sophisticated, idiomatic Dutch with fixed expressions, nuance and varied registers. Explain meanings precisely in Dutch, with nuance (at most 20 words).",
  },
};

export function toLevel(value: unknown): Level | null {
  return typeof value === "string" && (LEVELS as readonly string[]).includes(value) ? (value as Level) : null;
}

/** Beginners see English straight away; from B1 on it stays hidden behind "Show English". */
export function englishFirst(level: Level): boolean {
  return level === "A1" || level === "A2";
}

/** How many example sentences a card gets. */
export function exampleCount(level: Level): number {
  return level === "A1" || level === "A2" ? 2 : 3;
}
