import type { Example, Related } from "@/lib/types";

/**
 * The AI sees neutral field names ("sentence", "translation", "meaning", "meaning_translated").
 * Our stored fields are named nl/en from the Dutch-only first version; with German + Dutch translations
 * those names made the AI write the example in Dutch. These helpers convert between the two.
 */
export const exampleItem = {
  type: "object",
  properties: { sentence: { type: "string" }, translation: { type: "string" } },
  required: ["sentence", "translation"],
};

export function relatedItem(relations: string[]) {
  return {
    type: "object",
    properties: {
      word: { type: "string" },
      relation: { type: "string", enum: relations },
      translation: { type: "string" },
    },
    required: ["word", "relation", "translation"],
  };
}

export type AiExample = { sentence: string; translation: string };
export type AiRelated = { word: string; relation: string; translation: string };
export type AiMeanings = { meaning: string; meaning_translated: string };

export function toExamples(items: AiExample[] | undefined): Example[] {
  return (items ?? []).map((x) => ({ nl: x.sentence?.trim() ?? "", en: x.translation?.trim() ?? "" })).filter((x) => x.nl);
}

export function toRelated(items: AiRelated[] | undefined): Related[] {
  return (items ?? []).map((r) => ({ word: r.word, relation: r.relation, en: r.translation }));
}
