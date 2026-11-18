import { LANG_INFO, SUPPORT_LANGUAGES, toLang } from "@/lib/languages";
import { generateJson } from "@/lib/server/gemini";
import { handle, HttpError, readJson, requireUser, spendAiQuota } from "@/lib/server/http";
import type { Word } from "@/lib/types";

/** Cards re-translated per AI request. */
const BATCH = 15;

const schema = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          meaning_translated: { type: "string" },
          sentence_translations: { type: "array", items: { type: "string" } },
          related_translations: { type: "array", items: { type: "string" } },
          literal: { type: "string" },
          usage: { type: "string" },
        },
        required: ["id", "meaning_translated", "sentence_translations", "related_translations", "literal", "usage"],
      },
    },
  },
  required: ["items"],
};

type Row = Pick<Word, "id" | "word" | "article" | "language" | "kind" | "meaning_nl" | "meaning_en" | "examples" | "related" | "literal" | "usage">;
type Out = {
  id: string;
  meaning_translated: string;
  sentence_translations: string[];
  related_translations: string[];
  literal: string;
  usage: string;
};

/**
 * Re-writes all translations on saved cards (meaning, example sentences, related words, and for
 * expressions the literal meaning and usage note) in the translation language the user chose for
 * that learning language. Fixes older cards made in another language.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const { supabase, prefs } = await requireUser(req);
    const { ids } = await readJson<{ ids?: string[] }>(req);
    if (!Array.isArray(ids) || ids.length === 0) return { updated: 0 };
    if (ids.length > BATCH) throw new HttpError(400, `Send at most ${BATCH} cards at a time.`, "bad_request");

    const { data, error } = await supabase
      .from("words")
      .select("id, word, article, language, kind, meaning_nl, meaning_en, examples, related, literal, usage")
      .in("id", ids);
    if (error) throw error;
    const rows = (data ?? []) as Row[];
    if (rows.length === 0) return { updated: 0 };

    // Each learning language has its own translation language.
    const lang = toLang(rows[0].language) ?? "nl";
    if (rows.some((r) => r.language !== lang)) throw new HttpError(400, "Send cards of one language at a time.", "bad_request");
    const target = prefs.supports[lang] ?? (lang === "en" ? "nl" : "en");
    const targetName = SUPPORT_LANGUAGES[target];
    await spendAiQuota(supabase);

    const list = rows.map((r) => ({
      id: r.id,
      expression: r.article ? `${r.article} ${r.word}` : r.word,
      meaning: r.meaning_nl,
      sentences: r.examples.map((e) => e.nl),
      related_words: r.related.map((x) => x.word),
      ...(r.kind !== "word" ? { literal_now: r.literal, usage_now: r.usage } : {}),
    }));

    const prompt = `You translate study cards for a learner of ${LANG_INFO[lang].name}. Write EVERY output field in ${targetName}, and only in ${targetName}.
For each item:
- meaning_translated: the natural ${targetName} translation or equivalent of "expression" (use "meaning", written in ${LANG_INFO[lang].name}, to get the right sense); separate different meanings with "; ". Use a ${targetName} idiom only if it means EXACTLY the same; otherwise translate the meaning plainly. Never use a look-alike idiom with a different meaning.
- sentence_translations: a ${targetName} translation of each sentence in "sentences", in the same order and the same number. Translate what the sentence means, not word for word.
- related_translations: a short ${targetName} translation of each word in "related_words", in the same order and the same number.
- literal: if literal_now is given and not empty, the word-for-word meaning of the expression in ${targetName}; otherwise "".
- usage: if usage_now is given and not empty, the same advice rewritten in ${targetName}; otherwise "".
- id: copy the id.
Items: ${JSON.stringify(list)}`;

    const { items } = await generateJson<{ items: Out[] }>(prompt, schema, 0.2);
    const byId = new Map(items.map((it) => [it.id, it]));

    let updated = 0;
    for (const r of rows) {
      const it = byId.get(r.id);
      // Skip answers that don't line up with the card, rather than mixing up translations.
      if (!it || !it.meaning_translated || it.sentence_translations.length !== r.examples.length) continue;
      const { error: e } = await supabase
        .from("words")
        .update({
          meaning_en: it.meaning_translated.trim(),
          examples: r.examples.map((ex, i) => ({ nl: ex.nl, en: (it.sentence_translations[i] ?? "").trim() })),
          related: r.related.map((x, i) => ({ ...x, en: (it.related_translations[i] ?? x.en).trim() })),
          ...(r.kind !== "word" ? { literal: (it.literal ?? "").trim(), usage: (it.usage ?? "").trim() } : {}),
          translation_lang: target,
          review_task: null, // today's sentence was in the old language
          review_task_on: null,
        })
        .eq("id", r.id);
      if (!e) updated++;
    }
    return { updated, skipped: rows.length - updated, translation: target };
  });
}
