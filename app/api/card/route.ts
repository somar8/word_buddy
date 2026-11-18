import { LANG_INFO, SUPPORT_LANGUAGES } from "@/lib/languages";
import { exampleCount, LEVEL_INFO } from "@/lib/levels";
import { generateJson } from "@/lib/server/gemini";
import { handle, HttpError, readJson, requireUser, spendAiQuota } from "@/lib/server/http";
import { exampleItem, relatedItem, toExamples, toRelated, type AiExample, type AiRelated } from "@/lib/server/ai-shapes";
import type { Card } from "@/lib/types";

type AiCard = Omit<Card, "meaning_nl" | "meaning_en" | "examples" | "related"> & {
  meaning: string;
  meaning_translated: string;
  examples: AiExample[];
  related: AiRelated[];
};

function schemaFor(articles: string[], relations: string[]) {
  return {
    type: "object",
    properties: {
      found: { type: "boolean" },
      word: { type: "string" },
      article: { type: "string", enum: ["", ...articles] },
      part_of_speech: { type: "string" },
      forms: { type: "string" },
      meaning: { type: "string" },
      meaning_translated: { type: "string" },
      examples: { type: "array", items: exampleItem },
      related: { type: "array", items: relatedItem(relations) },
    },
    required: ["found", "word", "article", "part_of_speech", "forms", "meaning", "meaning_translated", "examples", "related"],
  };
}

/**
 * Builds a study card for a word in the language the user is learning.
 * Stored as meaning_nl / examples[].nl (learned language) and meaning_en / .en (translation): names from the
 * Dutch-only first version. The AI sees neutral names instead (lib/server/ai-shapes.ts).
 */
export async function POST(req: Request) {
  return handle(async () => {
    const { supabase, level, lang, prefs } = await requireUser(req);
    const { word } = await readJson<{ word?: string }>(req);
    const input = (word ?? "").trim().slice(0, 60);
    const info = LANG_INFO[lang];
    if (!input) throw new HttpError(400, `Type a ${info.name} word first.`, "empty");
    await spendAiQuota(supabase);

    const count = exampleCount(level);
    const support = SUPPORT_LANGUAGES[prefs.support];
    const prompt = `You are an experienced ${info.name} teacher. Your student is an adult at CEFR level ${level}: ${LEVEL_INFO[level].prompt} Their support language is ${support}.
The student typed this ${info.name} word or phrase: ${JSON.stringify(input)}

Build a study card as JSON:
- found: false only if the input is not ${info.name} at all; otherwise true.
- word: the correct ${info.name} dictionary form (fix spelling mistakes; use the base form of inflected words). Keep fixed phrases as phrases.${lang === "de" ? " Nouns start with a capital letter; other words are lowercase." : " Lowercase, except proper nouns."}
- article: ${info.articleRule}. Double-check it: a wrong article is worse than none.
- part_of_speech, in ${info.name}: one of ${info.partsOfSpeech.map((p) => JSON.stringify(p)).join(", ")}.
- forms: ${info.formsRule}.
- meaning: one short explanation IN ${info.name.toUpperCase()} that fits level ${level} and does not use the word itself.
- meaning_translated: short ${support} translation; separate different meanings with "; ".
- examples: ${count} natural ${info.name} sentences at ${level} level that use the word ("sentence", in ${info.name}), each with a ${support} translation ("translation").
- related: 3 or 4 useful related ${info.name} words (synonyms, opposites or same word family)${info.articles.length ? `, with the article in front of nouns` : ""}, the relation, and a ${support} translation ("translation").`;

    const ai = await generateJson<AiCard>(prompt, schemaFor(info.articles, info.relations));
    const card: Card = {
      ...ai,
      meaning_nl: ai.meaning,
      meaning_en: ai.meaning_translated,
      examples: toExamples(ai.examples),
      related: toRelated(ai.related),
    };
    if (!card.found) {
      throw new HttpError(
        422,
        `"${input}" doesn't look like a ${info.name} word. Check the spelling, or switch the language in Settings.`,
        "not_word",
      );
    }
    card.word = card.word.trim();
    card.examples = card.examples.slice(0, count);
    card.related = card.related.slice(0, 4);
    return { card, level, language: lang, translation: prefs.support };
  });
}
