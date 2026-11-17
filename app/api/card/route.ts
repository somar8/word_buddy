import { exampleCount, LEVEL_INFO } from "@/lib/levels";
import { generateJson } from "@/lib/server/gemini";
import { handle, HttpError, readJson, requireUser } from "@/lib/server/http";
import type { Card } from "@/lib/types";

const schema = {
  type: "object",
  properties: {
    found: { type: "boolean" },
    word: { type: "string" },
    article: { type: "string", enum: ["", "de", "het"] },
    part_of_speech: { type: "string" },
    forms: { type: "string" },
    meaning_nl: { type: "string" },
    meaning_en: { type: "string" },
    examples: {
      type: "array",
      items: {
        type: "object",
        properties: { nl: { type: "string" }, en: { type: "string" } },
        required: ["nl", "en"],
      },
    },
    related: {
      type: "array",
      items: {
        type: "object",
        properties: {
          word: { type: "string" },
          relation: { type: "string", enum: ["synoniem", "tegenovergestelde", "familie"] },
          en: { type: "string" },
        },
        required: ["word", "relation", "en"],
      },
    },
  },
  required: [
    "found",
    "word",
    "article",
    "part_of_speech",
    "forms",
    "meaning_nl",
    "meaning_en",
    "examples",
    "related",
  ],
};

export async function POST(req: Request) {
  return handle(async () => {
    const { level } = await requireUser(req);
    const count = exampleCount(level);
    const { word } = await readJson<{ word?: string }>(req);
    const input = (word ?? "").trim().slice(0, 60);
    if (!input) throw new HttpError(400, "Type a Dutch word first.");

    const prompt = `You are an experienced Dutch teacher. Your student is an adult at CEFR level ${level}: ${LEVEL_INFO[level].prompt} Their support language is English.
The student typed this word or phrase: ${JSON.stringify(input)}

Build a study card as JSON:
- found: false only if the input is not Dutch at all; otherwise true.
- word: the correct Dutch dictionary form, lowercase (fix spelling mistakes; use the base form of inflected words, e.g. "liep" -> "lopen", "afspraken" -> "afspraak"). Keep fixed phrases as phrases.
- article: "de" or "het" for nouns, "" for everything else. Double-check it: a wrong article is worse than none.
- part_of_speech, in Dutch: one of "zelfstandig naamwoord", "werkwoord", "bijvoeglijk naamwoord", "bijwoord", "voorzetsel", "voegwoord", "uitdrukking", "anders".
- forms: nouns -> "meervoud: ..."; verbs -> "verleden tijd: ... · voltooid deelwoord: ..."; adjectives -> "vergrotende trap: ..." if useful; otherwise "".
- meaning_nl: one short explanation in Dutch that fits level ${level} and does not use the word itself.
- meaning_en: short English translation; separate different meanings with "; ".
- examples: ${count} natural Dutch sentences at ${level} level that use the word, each with an English translation.
- related: 3 or 4 useful related Dutch words (synonyms, opposites or same word family), with "de"/"het" in front of nouns, the relation, and an English translation.`;

    const card = await generateJson<Card>(prompt, schema);
    if (!card.found) {
      throw new HttpError(422, `"${input}" does not look like a Dutch word. Check the spelling.`);
    }
    card.word = card.word.trim();
    card.examples = card.examples.slice(0, count);
    card.related = card.related.slice(0, 4);
    return { card, level };
  });
}
