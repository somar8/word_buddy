import { LANG_INFO, SUPPORT_LANGUAGES } from "@/lib/languages";
import { LEVEL_INFO } from "@/lib/levels";
import { generateJson } from "@/lib/server/gemini";
import { cachedTask, keyPart } from "@/lib/practice";
import { handle, HttpError, readJson, requireUser, spendAiQuota } from "@/lib/server/http";
import type { AiTask, Word } from "@/lib/types";

const schema = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          sentence: { type: "string" },
          answer: { type: "string" },
          translation: { type: "string" },
          distractors: { type: "array", items: { type: "string" } },
        },
        required: ["id", "sentence", "answer", "translation", "distractors"],
      },
    },
  },
  required: ["items"],
};

type Item = Omit<AiTask, "en"> & { id: string; translation: string };

/**
 * Makes today's fresh exercise sentences for the given words in ONE AI call,
 * and stores them so each word costs at most one generation per day.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const { supabase, level, lang, prefs } = await requireUser(req);
    const { ids, today } = await readJson<{ ids?: string[]; today?: string }>(req);
    if (!Array.isArray(ids) || ids.length === 0) return { tasks: {} };
    if (!today || !/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new HttpError(400, "Invalid date.");

    const { data, error } = await supabase
      .from("words")
      .select("id, word, article, part_of_speech, meaning_nl, examples, related, review_task, review_task_on, translation_lang, kind, key_word")
      .in("id", ids.slice(0, 60));
    if (error) throw error;
    const words = (data ?? []) as Pick<
      Word,
      "id" | "word" | "article" | "part_of_speech" | "meaning_nl" | "examples" | "related" | "review_task" | "review_task_on" | "translation_lang" | "kind" | "key_word"
    >[];

    const tasks: Record<string, AiTask> = {};
    const todo = words.filter((w) => {
      const cached = cachedTask(w, today);
      if (cached) {
        tasks[w.id] = cached;
        return false;
      }
      return true;
    });
    if (todo.length === 0) return { tasks };
    await spendAiQuota(supabase);
    const info = LANG_INFO[lang];

    const list = todo.map((w) => ({
      id: w.id,
      word: w.article ? `${w.article} ${w.word}` : w.word,
      part_of_speech: w.part_of_speech,
      meaning: w.meaning_nl,
      avoid_sentences: w.examples.map((e) => e.nl),
      related_words: w.related.map((r) => r.word),
      kind: w.kind ?? "word",
      ...(w.kind && w.kind !== "word" ? { key_part: keyPart(w.word, w.key_word) } : {}),
      translate_into: SUPPORT_LANGUAGES[(w.translation_lang as keyof typeof SUPPORT_LANGUAGES) ?? prefs.support] ?? SUPPORT_LANGUAGES[prefs.support],
    }));

    const prompt = `You are a ${info.name} teacher making fill-in-the-gap exercises for an adult at CEFR level ${level}: ${LEVEL_INFO[level].prompt}
For EACH word below write one NEW natural ${info.name} sentence (not one of avoid_sentences) at ${level} level.
- sentence: the sentence with the target word replaced by exactly one "___" (three underscores). Leave any article${info.articles.length ? ` (${info.articles.map((a) => `"${a}"`).join("/")})` : ""} in the sentence, outside the gap.
- answer: the exact word form that fills the gap (it may be inflected, e.g. plural or past tense).
- translation: translation of the full sentence into that word's translate_into language.
- distractors: 2 other ${info.name} words of the same word class and in the same form as the answer that do NOT fit the sentence. Prefer related_words if they clearly do not fit.
- id: copy the id.
Items whose kind is not "word" are expressions (phrase, idiom, saying or sentence): write a sentence that uses the whole expression naturally (verbs may be conjugated), and replace ONLY its key_part with "___"; answer is that key part exactly as it appears in your sentence; distractors are 2 wrong alternatives for the key part that do not fit.
Words: ${JSON.stringify(list)}`;

    const { items } = await generateJson<{ items: Item[] }>(prompt, schema, 0.9);
    const known = new Set(todo.map((w) => w.id));
    const langOf = new Map(todo.map((w) => [w.id, w.translation_lang ?? "en"]));

    await Promise.all(
      items
        .filter((it) => known.has(it.id) && it.sentence.includes("___") && it.answer)
        .map(async (it) => {
          const task: AiTask = {
            sentence: it.sentence,
            answer: it.answer.trim(),
            en: it.translation,
            distractors: it.distractors.filter((d) => d && d !== it.answer).slice(0, 2),
            lang: langOf.get(it.id),
          };
          tasks[it.id] = task;
          await supabase
            .from("words")
            .update({ review_task: task, review_task_on: today })
            .eq("id", it.id);
        }),
    );
    return { tasks };
  });
}
