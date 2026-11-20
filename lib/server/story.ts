import { LANG_INFO, SUPPORT_LANGUAGES, type Lang, type SupportLang } from "@/lib/languages";
import { LEVEL_INFO, type Level } from "@/lib/levels";

/** Story length per level, in words. */
const LENGTH: Record<Level, number> = { A1: 60, A2: 90, B1: 130, B2: 170, C1: 220, C2: 250 };

export const storySchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    text: { type: "string" },
    translation: { type: "string" },
    used: { type: "array", items: { type: "string" } },
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question: { type: "string" },
          options: { type: "array", items: { type: "string" } },
          answer: { type: "integer" },
          explanation: { type: "string" },
        },
        required: ["question", "options", "answer", "explanation"],
      },
    },
  },
  required: ["title", "text", "translation", "used", "questions"],
};

export type StoryContent = {
  title: string;
  text: string;
  translation: string;
  used: string[]; // the forms of the learner's words as they appear in the text
  questions: { question: string; options: string[]; answer: number; explanation: string }[];
};

export function storyPrompt(words: string[], lang: Lang, level: Level, support: SupportLang): string {
  const info = LANG_INFO[lang];
  const name = SUPPORT_LANGUAGES[support];
  return `You write short reading texts for an adult learning ${info.name} at CEFR level ${level}: ${LEVEL_INFO[level].prompt}
Write ONE short, natural, everyday story or dialogue in ${info.name} of about ${LENGTH[level]} words that uses ALL of these words or expressions (any correct form): ${JSON.stringify(words)}.
Make it coherent and a little interesting (a small situation with a beginning and an end), not a list of sentences.
Return JSON:
- title: a short title in ${info.name}.
- text: the story in ${info.name}. Paragraphs separated by a blank line.
- translation: a natural ${name} translation of the whole story, with the same paragraphs.
- used: for each given word or expression, the exact form as it appears in your text (copy it letter for letter).
- questions: 3 multiple-choice questions in ${info.name} about the story, at level ${level}, that check understanding. Each has 3 options in ${info.name}, "answer" is the index (0, 1 or 2) of the right option, and "explanation" says in ${name} why it is right.`;
}

/** Keeps only well-formed questions. */
export function cleanStory(s: StoryContent): StoryContent {
  return {
    ...s,
    used: (s.used ?? []).filter((u) => u && s.text.toLowerCase().includes(u.toLowerCase())),
    questions: (s.questions ?? [])
      .filter((q) => q.options?.length >= 2 && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length)
      .slice(0, 3),
  };
}
