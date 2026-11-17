import type { AiTask, Word } from "./types";

/** The first English meaning, for the matching list ("appointment; date" -> "appointment"). */
export function englishOf(meaningEn: string): string {
  return meaningEn.split(";")[0].trim();
}

/**
 * Makes a gap sentence from one of the word's own example sentences, for when the AI is not available.
 * Finds the word (or an inflected form that starts the same way) and replaces it with "___".
 */
export function gapFromExamples(word: Pick<Word, "word" | "examples">): AiTask | null {
  const w = word.word.toLowerCase().trim();
  for (const ex of word.examples) {
    const lower = ex.nl.toLowerCase();
    if (w.includes(" ")) {
      const at = lower.indexOf(w);
      if (at >= 0) {
        return {
          sentence: ex.nl.slice(0, at) + "___" + ex.nl.slice(at + w.length),
          answer: ex.nl.slice(at, at + w.length),
          en: ex.en,
          distractors: [],
        };
      }
      continue;
    }
    const stem = w.length <= 4 ? w : w.slice(0, Math.max(4, w.length - 3));
    const parts = ex.nl.split(/(\s+)/);
    const i = parts.findIndex((p) => p.toLowerCase().includes(stem));
    if (i < 0) continue;
    const core = parts[i].replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "");
    if (!core) continue;
    parts[i] = parts[i].replace(core, "___");
    return { sentence: parts.join(""), answer: core, en: ex.en, distractors: [] };
  }
  return null;
}
