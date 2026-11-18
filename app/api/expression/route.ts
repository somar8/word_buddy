import { LANG_INFO } from "@/lib/languages";
import { exampleCount } from "@/lib/levels";
import { keyPart } from "@/lib/practice";
import { expressionPrompt, expressionSchema } from "@/lib/server/expression";
import { generateJson } from "@/lib/server/gemini";
import { handle, HttpError, readJson, requireUser, spendAiQuota } from "@/lib/server/http";
import { toExamples, toRelated, type AiExample, type AiRelated } from "@/lib/server/ai-shapes";
import { toExpressionKind, type ExpressionCard } from "@/lib/types";

type AiExpression = Omit<ExpressionCard, "meaning_nl" | "meaning_en" | "examples" | "related"> & {
  meaning: string;
  meaning_translated: string;
  examples: AiExample[];
  related: AiRelated[];
};

/**
 * Builds a study card for an expression: a phrase, idiom, saying or whole sentence.
 * Like words, meaning_nl / examples[].nl are in the language being learned and meaning_en / .en in the translation language.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const { supabase, level, lang, prefs } = await requireUser(req);
    const { text } = await readJson<{ text?: string }>(req);
    const input = (text ?? "").trim().replace(/\s+/g, " ").slice(0, 200);
    const info = LANG_INFO[lang];
    if (!input) throw new HttpError(400, `Type a ${info.name} expression or sentence first.`, "empty");
    if (!input.includes(" ")) {
      throw new HttpError(422, "That is a single word. Switch to “Word” at the top to add it.", "single_word");
    }
    await spendAiQuota(supabase);

    const count = exampleCount(level);
    const ai = await generateJson<AiExpression>(expressionPrompt(input, lang, level, prefs.support), expressionSchema(lang));
    const card: ExpressionCard = {
      ...ai,
      meaning_nl: ai.meaning,
      meaning_en: ai.meaning_translated,
      examples: toExamples(ai.examples),
      related: toRelated(ai.related),
    };
    if (!card.found) {
      throw new HttpError(
        422,
        `"${input.slice(0, 40)}" doesn't look like ${info.name}. Check it, or switch the language in Settings.`,
        "not_word",
      );
    }
    card.word = card.word.trim();
    // Never let a missing or odd kind through: the database would file it as a plain word.
    card.kind = toExpressionKind(ai.kind);
    card.literal = ai.literal ?? "";
    card.usage = ai.usage ?? "";
    // The key word must be a continuous piece of the expression, or exercises can't blank it out.
    card.key_word = keyPart(card.word, card.key_word ?? "");
    card.examples = card.examples.slice(0, count);
    card.related = card.related.slice(0, 3);
    return { card, level, language: lang, translation: prefs.support };
  });
}
