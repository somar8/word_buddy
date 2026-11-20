import { addDays } from "./schedule";

/**
 * Days in a row with any practice (a review, a test or the daily story), counting back from today.
 * If you haven't practised yet today, the streak still counts up to yesterday, so it doesn't look
 * broken in the morning.
 */
export function streak(activeDays: Set<string>, today: string): number {
  let day = activeDays.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (activeDays.has(day)) {
    n++;
    day = addDays(day, -1);
  }
  return n;
}

/** The last `n` days, oldest first, as YYYY-MM-DD. */
export function lastDays(today: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addDays(today, i - n + 1));
}

/** The local date (YYYY-MM-DD) of a timestamp. */
export function localDay(iso: string): string {
  return new Intl.DateTimeFormat("en-CA").format(new Date(iso));
}
