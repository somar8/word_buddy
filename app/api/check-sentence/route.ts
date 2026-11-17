import { generateJson } from "@/lib/server/gemini";
import { handle, HttpError, readJson, requireUser } from "@/lib/server/http";
import type { SentenceCheck } from "@/lib/types";

const schema = {
  type: "object",
  properties: {
    correct: { type: "boolean" },
    feedback_nl: { type: "string" },
    feedback_en: { type: "string" },
    corrected: { type: "string" },
  },
  required: ["correct", "feedback_nl", "feedback_en", "corrected"],
};

/** Checks a sentence the learner wrote with their word (review 5). */
export async function POST(req: Request) {
  return handle(async () => {
    const { supabase, level } = await requireUser(req);
    const { wordId, sentence } = await readJson<{ wordId?: string; sentence?: string }>(req);
    const text = (sentence ?? "").trim().slice(0, 300);
    if (!wordId || !text) throw new HttpError(400, "Write a sentence first.");

    const { data: word, error } = await supabase
      .from("words")
      .select("word, article, meaning_nl, meaning_en")
      .eq("id", wordId)
      .single();
    if (error || !word) throw new HttpError(404, "Word not found.");

    const target = word.article ? `${word.article} ${word.word}` : word.word;
    const prompt = `You are a kind Dutch teacher. A learner at CEFR level ${level} practised the word ${JSON.stringify(target)} (meaning: ${word.meaning_nl} / ${word.meaning_en}).
They wrote this sentence: ${JSON.stringify(text)}

Return JSON:
- correct: true if the sentence uses the word (any correct form) with the right meaning and is understandable Dutch. Small mistakes elsewhere in the sentence are fine; a wrong article or wrong form of the target word is not.
- feedback_nl: one or two short sentences of feedback in Dutch the learner understands at ${level}.
- feedback_en: the same feedback in English.
- corrected: the sentence with all mistakes fixed (the same sentence if it was already right).`;

    const check = await generateJson<SentenceCheck>(prompt, schema, 0.2);
    return { check };
  });
}
