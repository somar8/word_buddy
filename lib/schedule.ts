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

/** How well you knew it. "Again" = you didn't. */
export type Rating = "again" | "hard" | "good" | "easy";

/** Days until the next review when you answer "Good" at this stage. */
function gapAfter(stage: number): number {
  if (stage >= 6) return LEARNED_CHECK_DAYS;
  return REVIEW_DAYS[stage] - REVIEW_DAYS[stage - 1];
}

/**
 * Where a word goes after an answer:
 * - Again: two reviews back (not to the start), and tomorrow.
 * - Hard:  same review again, after half the usual gap.
 * - Good:  next review, after the usual gap (days 1, 3, 7, 14, 30, 60, then learned).
 * - Easy:  skips a review.
 * Learned words: Again -> review 5 tomorrow, Hard -> check in 30 days, Good -> 90, Easy -> 180.
 */
export function nextState(stage: number, rating: Rating, today: string): { stage: number; due_on: string } {
  if (stage >= LEARNED) {
    if (rating === "again") return { stage: 5, due_on: addDays(today, 1) };
    const days = rating === "hard" ? 30 : rating === "easy" ? LEARNED_CHECK_DAYS * 2 : LEARNED_CHECK_DAYS;
    return { stage: LEARNED, due_on: addDays(today, days) };
  }
  switch (rating) {
    case "again":
      return { stage: Math.max(1, stage - 2), due_on: addDays(today, 1) };
    case "hard":
      return { stage, due_on: addDays(today, Math.max(1, Math.ceil(gapAfter(stage) / 2))) };
    case "good":
      return { stage: Math.min(LEARNED, stage + 1), due_on: addDays(today, gapAfter(stage)) };
    case "easy": {
      const next = Math.min(LEARNED, stage + 2);
      const days = gapAfter(stage) + (stage + 1 < LEARNED ? gapAfter(stage + 1) : 0);
      return { stage: next, due_on: addDays(today, days) };
    }
  }
}

/** A word you keep forgetting: answered "Again" this many times. */
export const HARD_LAPSES = 2;

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Each review gets a little harder, and mixes reading, writing, listening and speaking:
 * 1 meaning · 2 type / recall from the translation / listen · 3 gap / listen · 4 choose / say it · 5 write ·
 * 6 and learned checks: any of them. Picked per word and day, so it varies but doesn't jump around.
 */
export function taskFor(word: Pick<Word, "id" | "stage"> & { kind?: string }, today: string): TaskType {
  const task = baseTask(word, today);
  // Typing a whole expression with an article makes no sense: complete its key part instead.
  if ((task === "type" || task === "recall") && word.kind && word.kind !== "word") return "complete";
  return task;
}

function pick(options: TaskType[], seed: string): TaskType {
  return options[hash(seed) % options.length];
}

function baseTask(word: Pick<Word, "id" | "stage">, today: string): TaskType {
  const seed = word.id + today;
  switch (word.stage) {
    case 1:
      return "meaning";
    case 2:
      return pick(["type", "recall", "listen"], seed);
    case 3:
      return pick(["gap", "gap", "listen"], seed);
    case 4:
      return pick(["choose", "say"], seed);
    case 5:
      return "write";
    default:
      return pick(["meaning", "type", "recall", "gap", "choose", "listen", "say"], seed);
  }
}

/** Exercises that need the phone's voice (listen) or microphone (say), and what replaces them. */
export const AUDIO_FALLBACK: Partial<Record<TaskType, TaskType>> = { listen: "type", say: "recall" };

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
