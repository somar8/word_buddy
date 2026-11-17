import {
  LEARNED_CHECK_DAYS,
  MAX_NEW_WORDS_PER_DAY,
  REVIEW_DAYS,
} from "./config";
import type { TaskType, Word } from "./types";

const LEARNED = 7;

/** Today's date in the device's own time zone, as YYYY-MM-DD. */
export function todayLocal(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA").format(now);
}

/** Today's date in a given time zone, as YYYY-MM-DD (used by the server). */
export function todayIn(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(now);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/**
 * First review date for a new word. The first 10 words of a day are due tomorrow;
 * every next group of 10 waits one more day, so the daily load stays even.
 */
export function firstDueDate(today: string, wordsAddedToday: number): string {
  return addDays(today, 1 + Math.floor(wordsAddedToday / MAX_NEW_WORDS_PER_DAY));
}

/** Where a word goes after an answer. */
export function nextState(
  stage: number,
  correct: boolean,
  today: string,
): { stage: number; due_on: string } {
  if (!correct) return { stage: 1, due_on: addDays(today, 1) };
  if (stage >= 6) return { stage: LEARNED, due_on: addDays(today, LEARNED_CHECK_DAYS) };
  const gap = REVIEW_DAYS[stage] - REVIEW_DAYS[stage - 1];
  return { stage: stage + 1, due_on: addDays(today, gap) };
}

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Each review gets a little harder; review 6 and learned-word checks mix the types. */
export function taskFor(word: Pick<Word, "id" | "stage">, today: string): TaskType {
  switch (word.stage) {
    case 1:
      return "meaning";
    case 2:
      return "type";
    case 3:
      return "gap";
    case 4:
      return "choose";
    case 5:
      return "write";
    default: {
      const mixed: TaskType[] = ["meaning", "type", "gap", "choose"];
      return mixed[hash(word.id + today) % mixed.length];
    }
  }
}

export function needsAiTask(task: TaskType): boolean {
  return task === "gap" || task === "choose";
}

export type WordStatus = "due" | "learning" | "learned";

export function statusOf(word: Pick<Word, "stage" | "due_on">, today: string): WordStatus {
  if (word.due_on <= today) return "due";
  if (word.stage >= LEARNED) return "learned";
  return "learning";
}

export function stageLabel(stage: number): string {
  return stage >= LEARNED ? "Learned" : `Review ${stage} of 6`;
}

export function dueLabel(dueOn: string, today: string): string {
  const days = daysBetween(today, dueOn);
  if (days <= 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 60) return `In ${days} days`;
  return `In ${Math.round(days / 30)} months`;
}

/** Lowercase, trim and drop punctuation so small typing differences don't count. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[.!?,;:"'“”‘’()]/g, "")
    .replace(/\s+/g, " ");
}

export function fullWord(word: Pick<Word, "article" | "word">): string {
  return word.article ? `${word.article} ${word.word}` : word.word;
}

/** Same shuffle every time for the same word and day, so options don't jump around. */
export function stableShuffle<T>(items: T[], seed: string): T[] {
  const out = [...items];
  let h = hash(seed) || 1;
  for (let i = out.length - 1; i > 0; i--) {
    h = (h * 1103515245 + 12345) & 0x7fffffff;
    const j = h % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
