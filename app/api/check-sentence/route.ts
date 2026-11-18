import { generateJson } from "@/lib/server/gemini";
import { LANG_INFO, SUPPORT_LANGUAGES } from "@/lib/languages";
import { handle, HttpError, readJson, requireUser, spendAiQuota } from "@/lib/server/http";
import type { SentenceCheck } from "@/lib/types";

const schema = {
  type: "object",
  properties: {
    correct: { type: "boolean" },
    feedback: { type: "string" },
    feedback_translated: { type: "string" },
    corrected: { type: "string" },
    translation: { type: "string" },
  },
  required: ["correct", "feedback", "feedback_translated", "corrected", "translation"],
};

/** Checks a sentence the learner wrote with their word (review 5, and "Add a sentence" on a word). */
export async function POST(req: Request) {
  return handle(async () => {
    const { supabase, level, prefs } = await requireUser(req);
    const { wordId, sentence } = await readJson<{ wordId?: string; sentence?: string }>(req);
    const text = (sentence ?? "").trim().slice(0, 300);
    if (!wordId || !text) throw new HttpError(400, "Write a sentence first.", "empty");

    const { data: word, error } = await supabase
      .from("words")
      .select("word, article, meaning_nl, meaning_en, language, translation_lang, kind")
      .eq("id", wordId)
      .single();
    if (error || !word) throw new HttpError(404, "This word no longer exists. Go back to your word list.", "not_found");
    await spendAiQuota(supabase);
    const info = LANG_INFO[(word.language as keyof typeof LANG_INFO) ?? "nl"] ?? LANG_INFO.nl;
    // Keep the card in one translation language: the one it was made with.
    const support = SUPPORT_LANGUAGES[(word.translation_lang as keyof typeof SUPPORT_LANGUAGES) ?? prefs.support] ?? SUPPORT_LANGUAGES[prefs.support];

    const target = word.article ? `${word.article} ${word.word}` : word.word;
    const prompt = `You are a kind ${info.name} teacher. A learner at CEFR level ${level} practised the ${word.kind && word.kind !== "word" ? "expression" : "word"} ${JSON.stringify(target)} (meaning: ${word.meaning_nl} / ${word.meaning_en}).
They wrote this sentence: ${JSON.stringify(text)}

Return JSON:
- correct: true if the sentence uses it (any correct form) with the right meaning and is understandable ${info.name}. Small mistakes elsewhere in the sentence are fine; a wrong article or a wrong form of the target word or expression is not.
- feedback: one or two short sentences of feedback in ${info.name} the learner understands at ${level}.
- feedback_translated: the same feedback in ${support}.
- corrected: the sentence with all mistakes fixed (the same sentence if it was already right).
- translation: ${support} translation of the corrected sentence.`;

    const ai = await generateJson<Omit<SentenceCheck, "feedback_nl" | "feedback_en"> & { feedback: string; feedback_translated: string }>(prompt, schema, 0.2);
    const check: SentenceCheck = { ...ai, feedback_nl: ai.feedback, feedback_en: ai.feedback_translated };
    return { check };
  });
}
