"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePrefs } from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import { LANG_INFO } from "@/lib/languages";
import { lastDays, localDay, streak } from "@/lib/progress";
import { addDays, fullWord, HARD_LAPSES, todayLocal } from "@/lib/schedule";
import { supabase } from "@/lib/supabase";
import type { Word } from "@/lib/types";

type DayRow = { day: string; reviews: number; correct: number };
type WordRow = Pick<Word, "id" | "word" | "article" | "kind" | "stage" | "lapses" | "meaning_en">;
type Data = {
  days: DayRow[];
  tests: { taken_at: string; right_count: number; total: number }[];
  stories: { day: string; score: number | null }[];
  words: WordRow[];
};

const STAGES = [1, 2, 3, 4, 5, 6, 7];

export default function ProgressPage() {
  const prefs = usePrefs();
  const lang = prefs.language;
  const [today] = useState(todayLocal);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const db = supabase();
    const since = addDays(today, -59);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Amsterdam";
    Promise.all([
      db.rpc("practice_days", { lang, tz, since }),
      db.from("tests").select("taken_at, right_count, total").eq("language", lang).gte("taken_at", `${since}T00:00:00`),
      db.from("stories").select("day, score").eq("language", lang).gte("day", since),
      db.from("words").select("id, word, article, kind, stage, lapses, meaning_en").eq("language", lang),
    ]).then(([d, t, s, w]) => {
      const failed = [d, t, s, w].find((r) => r.error);
      if (failed?.error) {
        setError(
          /practice_days|lapses|stories/.test(failed.error.message)
            ? "Your database is missing the latest update. Run supabase/schema.sql again in Supabase."
            : failed.error.message,
        );
        return;
      }
      setData({
        days: ((d.data ?? []) as DayRow[]).map((r) => ({ ...r, reviews: Number(r.reviews), correct: Number(r.correct) })),
        tests: t.data ?? [],
        stories: s.data ?? [],
        words: (w.data ?? []) as WordRow[],
      });
    });
  }, [lang, today]);

  const stats = useMemo(() => {
    if (!data) return null;
    const byDay = new Map(data.days.map((r) => [r.day, r]));
    const active = new Set<string>([
      ...data.days.filter((r) => r.reviews > 0).map((r) => r.day),
      ...data.tests.map((t) => localDay(t.taken_at)),
      ...data.stories.filter((s) => s.score !== null).map((s) => s.day),
    ]);
    const week = lastDays(today, 7);
    const weekRows = week.map((d) => byDay.get(d)).filter(Boolean) as DayRow[];
    const weekReviews = weekRows.reduce((n, r) => n + r.reviews, 0);
    const weekCorrect = weekRows.reduce((n, r) => n + r.correct, 0);
    const chart = lastDays(today, 14).map((d) => ({ day: d, reviews: byDay.get(d)?.reviews ?? 0, correct: byDay.get(d)?.correct ?? 0 }));
    const stageCounts = STAGES.map((st) => data.words.filter((w) => (st === 7 ? w.stage >= 7 : w.stage === st)).length);
    const hard = data.words.filter((w) => (w.lapses ?? 0) >= HARD_LAPSES).sort((a, b) => (b.lapses ?? 0) - (a.lapses ?? 0));
    const recentTests = data.tests.filter((t) => localDay(t.taken_at) >= week[0]);
    const testAvg = recentTests.length
      ? Math.round((recentTests.reduce((n, t) => n + t.right_count / Math.max(1, t.total), 0) / recentTests.length) * 100)
      : null;
    return {
      streak: streak(active, today),
      todayReviews: byDay.get(today)?.reviews ?? 0,
      weekReviews,
      accuracy: weekReviews ? Math.round((weekCorrect / weekReviews) * 100) : null,
      chart,
      stageCounts,
      learned: stageCounts[6],
      total: data.words.length,
      hard,
      testAvg,
      storyToday: data.stories.find((s) => s.day === today),
    };
  }, [data, today]);

  const goal = prefs.dailyGoal;

  return (
    <>
      <PageHeader title="Progress" />
      <main className="flex flex-col gap-4 px-5 pb-6 pt-2">
        <h1 className="font-display text-[28px] font-bold">My progress</h1>
        {error && <p role="alert" className="rounded-xl bg-due-soft px-4 py-3 text-sm text-due-ink">{error}</p>}
        {!stats && !error && <p className="text-soft" aria-busy="true">Loading…</p>}

        {stats && (
          <>
            {/* Today: goal and streak */}
            <section aria-label="Today" className="grid grid-cols-2 gap-2.5">
              <div className="panel flex flex-col gap-1 p-4">
                <span className="text-xs font-semibold text-muted">Streak</span>
                <span className="font-display text-3xl font-bold">
                  {stats.streak} <span className="text-base font-semibold text-soft">{stats.streak === 1 ? "day" : "days"}</span>
                </span>
                <span className="text-xs text-muted">Days in a row you practised</span>
              </div>
              <div className="panel flex flex-col gap-1.5 p-4">
                <span className="text-xs font-semibold text-muted">Today&apos;s goal</span>
                <span className="font-display text-3xl font-bold">
                  {Math.min(stats.todayReviews, goal)}<span className="text-base font-semibold text-soft">/{goal}</span>
                </span>
                <div role="progressbar" aria-label="Daily goal" aria-valuemin={0} aria-valuemax={goal}
                  aria-valuenow={Math.min(stats.todayReviews, goal)} className="h-1.5 overflow-hidden rounded-full bg-hairline">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, (stats.todayReviews / goal) * 100)}%` }} />
                </div>
                <span className="text-xs text-muted">{stats.todayReviews >= goal ? "Goal reached 🎉" : "reviews"}</span>
              </div>
            </section>

            {/* Story */}
            <Link href="/story" className="panel flex items-center justify-between gap-3 p-4">
              <span className="flex flex-col">
                <span className="font-semibold">Today&apos;s story</span>
                <span className="text-sm text-muted">
                  {stats.storyToday?.score != null ? `Read · ${stats.storyToday.score}/3 right` : `A short ${LANG_INFO[lang].name} text with your words`}
                </span>
              </span>
              <span aria-hidden="true" className="text-xl text-accent">→</span>
            </Link>

            {/* This week */}
            <section aria-labelledby="week-title" className="panel flex flex-col gap-3 p-5">
              <h2 id="week-title" className="font-display text-lg font-bold">Last 7 days</h2>
              <dl className="grid grid-cols-3 gap-2 text-center">
                <Stat label="reviews" value={String(stats.weekReviews)} />
                <Stat label="right" value={stats.accuracy === null ? "—" : `${stats.accuracy}%`} />
                <Stat label="test score" value={stats.testAvg === null ? "—" : `${stats.testAvg}%`} />
              </dl>
              <ReviewChart rows={stats.chart} today={today} />
            </section>

            {/* Where your words are */}
            <section aria-labelledby="stages-title" className="panel flex flex-col gap-3 p-5">
              <div className="flex items-baseline justify-between">
                <h2 id="stages-title" className="font-display text-lg font-bold">Where your words are</h2>
                <span className="text-sm text-soft">{stats.learned} of {stats.total} learned</span>
              </div>
              <StageBars counts={stats.stageCounts} />
            </section>

            {/* Hard words */}
            <section aria-labelledby="hard-title" className="panel flex flex-col gap-3 p-5">
              <div className="flex items-baseline justify-between gap-3">
                <h2 id="hard-title" className="font-display text-lg font-bold">Hard words</h2>
                {stats.hard.length > 0 && <Link href="/test#hard" className="text-sm font-medium text-accent">Practise them</Link>}
              </div>
              {stats.hard.length === 0 ? (
                <p className="text-sm text-soft">None yet. Words you answer “Again” {HARD_LAPSES} or more times show up here.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-hairline">
                  {stats.hard.slice(0, 8).map((w) => (
                    <li key={w.id}>
                      <Link href={`/words/${w.id}`} className="flex items-center justify-between gap-3 py-2.5">
                        <span className="flex min-w-0 flex-col">
                          <span lang={lang} className="truncate font-semibold">{fullWord(w)}</span>
                          <span className="truncate text-xs text-muted">{w.meaning_en.split(";")[0]}</span>
                        </span>
                        <span className="shrink-0 text-xs text-muted">missed {w.lapses}×</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col rounded-xl bg-ground px-2 py-2.5">
      <dt className="order-2 text-xs text-muted">{label}</dt>
      <dd className="order-1 font-display text-xl font-bold">{value}</dd>
    </div>
  );
}

/** Reviews per day, last 14 days: one series, so one color and no legend. Hover or tap a bar for its numbers. */
function ReviewChart({ rows, today }: { rows: { day: string; reviews: number; correct: number }[]; today: string }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(5, ...rows.map((r) => r.reviews));
  const label = (d: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(new Date(`${d}T12:00:00`));
  const shown = active ?? rows.length - 1;
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="flex items-baseline justify-between text-sm">
        <span className="font-semibold">Reviews per day</span>
        <span className="text-xs text-muted" aria-live="polite">
          {label(rows[shown].day)}: <strong className="text-ink">{rows[shown].reviews}</strong>
          {rows[shown].reviews > 0 && ` · ${rows[shown].correct} right`}
        </span>
      </figcaption>
      <div className="relative mt-4 h-28 border-b border-line" onMouseLeave={() => setActive(null)} aria-hidden="true">
        <div className="absolute inset-x-0 top-0 border-t border-dashed border-hairline" />
        <div className="absolute inset-0 flex items-end gap-[2px]">
          {rows.map((r, i) => (
            <button key={r.day} type="button" tabIndex={-1}
              onMouseEnter={() => setActive(i)} onClick={() => setActive(i)}
              className="flex h-full flex-1 items-end justify-center">
              <span
                className={`block w-full max-w-5 rounded-t-[4px] ${r.day === today ? "bg-accent" : "bg-[#8ea2e6]"} ${active === i ? "outline-2 outline-offset-1 outline-accent-dark" : ""}`}
                style={{ height: r.reviews ? `${Math.max(4, (r.reviews / max) * 100)}%` : "2px", opacity: r.reviews ? 1 : 0.35 }} />
            </button>
          ))}
        </div>
        <span className="absolute -top-0.5 left-0 -translate-y-full text-[10px] text-muted">{max}</span>
      </div>
      <div className="flex justify-between text-[10px] text-muted" aria-hidden="true">
        <span>{label(rows[0].day)}</span>
        <span>Today</span>
      </div>
      <table className="sr-only">
        <caption>Reviews per day, last 14 days</caption>
        <thead><tr><th>Day</th><th>Reviews</th><th>Right</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.day}><td>{label(r.day)}</td><td>{r.reviews}</td><td>{r.correct}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}

/** How many words sit at each review step: magnitude in one hue, with the count written next to each bar. */
function StageBars({ counts }: { counts: number[] }) {
  const max = Math.max(1, ...counts);
  return (
    <ul className="flex flex-col gap-1.5">
      {counts.map((n, i) => (
        <li key={i} className="grid grid-cols-[72px_1fr_28px] items-center gap-2 text-sm">
          <span className={i === 6 ? "font-semibold text-good-ink" : "text-soft"}>{i === 6 ? "Learned" : `Review ${i + 1}`}</span>
          <span className="h-3 overflow-hidden rounded-[4px] bg-ground">
            <span className={`block h-full rounded-r-[4px] ${i === 6 ? "bg-[#2f8a55]" : "bg-[#8ea2e6]"}`}
              style={{ width: n ? `${Math.max(3, (n / max) * 100)}%` : "0%" }} />
          </span>
          <span className="text-right font-semibold tabular-nums">{n}</span>
        </li>
      ))}
    </ul>
  );
}
