"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { dueLabel, stageLabel, statusOf, todayLocal, type WordStatus } from "@/lib/schedule";
import { supabase } from "@/lib/supabase";
import type { Word } from "@/lib/types";

type Filter = "all" | WordStatus;
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "due", label: "Due today" },
  { id: "learning", label: "Learning" },
  { id: "learned", label: "Learned" },
];

type Row = Pick<Word, "id" | "word" | "article" | "meaning_nl" | "stage" | "due_on">;

export default function WordsPage() {
  const [today] = useState(todayLocal);
  const [words, setWords] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    supabase()
      .from("words")
      .select("id, word, article, meaning_nl, stage, due_on")
      .order("added_on", { ascending: false })
      .order("created_at", { ascending: false })
      .then(({ data, error: e }) => {
        if (e) setError(e.message);
        else setWords((data ?? []) as Row[]);
      });
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (words ?? []).filter(
      (w) =>
        (filter === "all" || statusOf(w, today) === filter) &&
        (!q || w.word.toLowerCase().includes(q) || w.meaning_nl.toLowerCase().includes(q)),
    );
  }, [words, filter, query, today]);

  return (
    <>
      <PageHeader />
      <div className="flex flex-col gap-3.5 px-5 pb-3 pt-2">
        <div className="flex items-baseline justify-between">
          <h1 className="font-display text-[28px] font-bold">My words</h1>
          {words && <span className="text-sm text-soft">{words.length} words</span>}
        </div>
        <div className="relative">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5a6070" strokeWidth="2"
            strokeLinecap="round" aria-hidden="true" className="absolute left-3.5 top-[15px]">
            <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
          </svg>
          <input type="search" aria-label="Search your words" placeholder="Search a word" value={query}
            onChange={(e) => setQuery(e.target.value)} className="field h-12 pl-10" />
        </div>
        <div role="group" aria-label="Filter words" className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}
              className={`h-9 rounded-full border px-3.5 text-[13px] ${filter === f.id ? "border-ink bg-ink font-semibold text-white" : "border-line bg-white font-medium text-ink"}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <main className="px-5 pb-6">
        {error && <p role="alert" className="text-due-ink">{error}</p>}
        {words === null && !error && <p className="text-soft" aria-busy="true">Loading…</p>}
        {words && shown.length === 0 && (
          <p className="pt-4 text-soft">
            {words.length === 0 ? (
              <>No words yet. <Link href="/add" className="font-medium text-accent">Add your first word</Link>.</>
            ) : (
              "No words match."
            )}
          </p>
        )}
        {shown.length > 0 && (
          <ul className="panel overflow-hidden">
            {shown.map((w) => {
              const status = statusOf(w, today);
              return (
                <li key={w.id} className="border-b border-hairline last:border-b-0">
                  <Link href={`/words/${w.id}`} className="flex items-center justify-between gap-3 px-4 py-3.5">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span lang="nl" className="text-[17px] font-semibold">
                        {w.article && <span className="font-medium text-muted">{w.article} </span>}
                        {w.word}
                      </span>
                      <span lang="nl" className="truncate text-[13px] text-muted">{w.meaning_nl}</span>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <StatusPill status={status} label={dueLabel(w.due_on, today)} />
                      <span className="text-xs text-muted">{stageLabel(w.stage)}</span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}

function StatusPill({ status, label }: { status: WordStatus; label: string }) {
  const style =
    status === "due"
      ? "bg-due-soft text-due-ink"
      : status === "learned"
        ? "bg-good-soft text-good-ink"
        : "bg-accent-soft text-accent-dark";
  const text = status === "due" ? "Due today" : status === "learned" ? "Learned" : label;
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${style}`}>{text}</span>;
}
