import { LANG_INFO, SUPPORT_LANGUAGES, type Lang, type SupportLang } from "@/lib/languages";
import { exampleCount, LEVEL_INFO, type Level } from "@/lib/levels";
import { EXPRESSION_KINDS } from "@/lib/types";
import { exampleItem, relatedItem } from "./ai-shapes";

export function expressionSchema(lang: Lang) {
  return schemaFor(LANG_INFO[lang].relations);
}

function schemaFor(relations: string[]) {
  return {
    type: "object",
    properties: {
      found: { type: "boolean" },
      kind: { type: "string", enum: EXPRESSION_KINDS },
      word: { type: "string" },
      key_word: { type: "string" },
      part_of_speech: { type: "string" },
      meaning: { type: "string" },
      meaning_translated: { type: "string" },
      literal: { type: "string" },
      usage: { type: "string" },
      examples: { type: "array", items: exampleItem },
      related: { type: "array", items: relatedItem(relations) },
    },
    required: ["found", "kind", "word", "key_word", "part_of_speech", "meaning", "meaning_translated", "literal", "usage", "examples", "related"],
  };
}


/** The prompt for an expression card (see app/api/expression). */
export function expressionPrompt(input: string, lang: Lang, level: Level, supportLang: SupportLang) {
  const info = LANG_INFO[lang];
  const count = exampleCount(level);
  const support = SUPPORT_LANGUAGES[supportLang];
  return `You are an experienced ${info.name} teacher. Your student is an adult at CEFR level ${level}: ${LEVEL_INFO[level].prompt} Their support language is ${support}.
The student wants to learn this ${info.name} expression or sentence: ${JSON.stringify(input)}

Build a study card as JSON:
- found: false only if the input is not ${info.name} at all; otherwise true.
- kind: "idiom" if the meaning is not the sum of its words (figurative); "saying" for a proverb or fixed saying; "phrase" for a fixed combination or everyday expression (including verb + preposition combinations and set phrases); "sentence" for a complete ordinary sentence the student wants to remember.
- word: the expression in its correct, standard form (fix spelling and grammar). For idioms and phrases use the dictionary form (infinitive, with "iemand"/"jemand"/"someone" where the object varies). For a sentence, keep the student's sentence, corrected.
- key_word: the 1–3 most important words of the expression, copied as ONE continuous piece of "word" (no words skipped) — the part a learner must remember. Used to make fill-in exercises.
- part_of_speech: in ${info.name}, a short label for the kind (for example the ${info.name} word for "idiom", "saying", "fixed expression" or "sentence").
- meaning: what it means, explained IN ${info.name.toUpperCase()} for level ${level}, without repeating the expression.
- meaning_translated: the natural ${support} equivalent or translation (an equivalent ${support} expression only if it means EXACTLY the same — never a look-alike idiom with a different meaning; otherwise translate the meaning plainly); separate alternatives with "; ".
- literal: for idioms and sayings, the word-for-word ${support} translation; otherwise "".
- usage: one short ${support} sentence on when to use it: register (formal, informal, spoken, written), tone, and any trap (for example "only in the past tense" or "can sound rude"). "" for an ordinary sentence.
- examples: ${count} natural ${info.name} sentences at ${level} level that use the expression in everyday situations ("sentence", in ${info.name}), each with a ${support} translation ("translation"). For a sentence card, give variations of the sentence.
- related: 2 or 3 ${info.name} expressions with a similar or opposite meaning, the relation, and a ${support} translation ("translation").`;

}
