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

/** Lowercase and strip accents, so "e" finds "é", "Uber" finds "Über" and "strasse" finds "Straße". */
export function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .trim()
    .replace(/\s+/g, " ");
}

type Searchable = Pick<Word, "word" | "article" | "meaning_nl" | "meaning_en"> &
  Partial<Pick<Word, "related" | "note" | "literal" | "usage">>;

/**
 * Whether a word matches a search. Every typed term must appear in the word (with or without its
 * article), its meaning, its translation, a related word or the note.
 */
export function matchesSearch(w: Searchable, query: string): boolean {
  const terms = fold(query).split(" ").filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = fold(
    [
      w.article ? `${w.article} ${w.word}` : w.word,
      w.meaning_nl,
      w.meaning_en,
      ...(w.related ?? []).map((r) => `${r.word} ${r.en}`),
      w.note ?? "",
      w.literal ?? "",
      w.usage ?? "",
    ].join(" | "),
  );
  return terms.every((t) => haystack.includes(t));
}

/** Search hits on the word itself come first, then hits elsewhere. */
export function searchRank(w: Pick<Word, "word">, query: string): number {
  const q = fold(query);
  const word = fold(w.word);
  if (!q) return 0;
  if (word === q) return 0;
  if (word.startsWith(q)) return 1;
  if (word.includes(q)) return 2;
  return 3;
}

/** Placeholder words in dictionary forms of expressions ("iemand in de maling nemen"); never the key part. */
const PLACEHOLDERS = new Set([
  "iemand", "iemands", "iets", "zich", "jemand", "jemandem", "jemanden", "jemandes", "etwas", "sich",
  "someone", "someone's", "somebody", "something", "oneself", "sb", "sth",
]);

const SHORT = /^(de|het|een|der|die|das|den|dem|ein|eine|the|a|an|to|in|op|of|on|at|je|ik|i|you|du|ich)$/i;

function bare(token: string): string {
  return token.replace(/^[^\p{L}]+|[^\p{L}']+$/gu, "");
}

/**
 * The part of an expression that exercises blank out. Uses the AI's key word when it is a continuous piece
 * of the expression; otherwise the longest meaningful word in it.
 */
export function keyPart(expression: string, key: string): string {
  const k = key.trim();
  const at = k ? expression.toLowerCase().indexOf(k.toLowerCase()) : -1;
  if (at >= 0) return expression.slice(at, at + k.length);
  const words = expression.split(/\s+/).map(bare).filter((t) => t && !PLACEHOLDERS.has(t.toLowerCase()) && !SHORT.test(t));
  const fromKey = new Set(k.split(/\s+/).map((t) => bare(t).toLowerCase()));
  const pool = words.some((w) => fromKey.has(w.toLowerCase())) ? words.filter((w) => fromKey.has(w.toLowerCase())) : words;
  return pool.reduce((best, w) => (w.length > best.length ? w : best), "");
}

/** Replaces the first occurrence of `part` in `text` (any case) with "___". */
export function blankOut(text: string, part: string): { sentence: string; answer: string } | null {
  if (!part) return null;
  const at = text.toLowerCase().indexOf(part.toLowerCase());
  if (at < 0) return null;
  return { sentence: text.slice(0, at) + "___" + text.slice(at + part.length), answer: text.slice(at, at + part.length) };
}

/**
 * A fill-in exercise for an expression, without AI: first try an example sentence, then the expression itself.
 */
export function expressionGap(w: Pick<Word, "word" | "key_word" | "examples">): AiTask | null {
  const key = keyPart(w.word, w.key_word);
  for (const ex of w.examples) {
    const b = blankOut(ex.nl, key);
    if (b) return { ...b, en: ex.en, distractors: [] };
  }
  const b = blankOut(w.word, key);
  return b ? { ...b, en: "", distractors: [] } : null;
}

/**
 * Today's stored AI exercise for a word, but only if it was made for today AND in the card's
 * translation language (otherwise a changed language would keep showing the old translation all day).
 */
export function cachedTask(
  w: Pick<Word, "review_task" | "review_task_on"> & { translation_lang?: string | null },
  today: string,
): AiTask | null {
  const t = w.review_task;
  if (!t || w.review_task_on !== today) return null;
  return (t.lang ?? "en") === (w.translation_lang ?? "en") ? t : null;
}

/** Edit distance between two strings: letters added, removed or changed, and two letters swapped, each count 1. */
export function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/**
 * Whether a typed or spoken answer is close enough. Capitals, punctuation and accents don't count.
 * Word by word: short words (articles, "op", "in"…) must be exact; longer words may have one slip
 * per 8 letters, so "fiest" passes for "fiets" but "de" never passes for "die".
 */
export function closeEnough(given: string, target: string): boolean {
  const clean = (x: string) => fold(x).replace(/[.,!?;:"“”‘’()]/g, " ").split(" ").filter(Boolean);
  const g = clean(given);
  const t = clean(target);
  if (g.length === 0 || g.length !== t.length) return false;
  return t.every((word, i) => {
    if (word.length <= 3) return g[i] === word;
    return editDistance(g[i], word) <= Math.max(1, Math.floor(word.length / 8));
  });
}
