"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import WordCardView from "@/components/WordCardView";
import { dueLabel, stageLabel, todayLocal } from "@/lib/schedule";
import { supabase } from "@/lib/supabase";
import type { Word } from "@/lib/types";

export default function WordPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [today] = useState(todayLocal);
  const [word, setWord] = useState<Word | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    supabase()
      .from("words")
      .select("*")
      .eq("id", id)
      .single()
      .then(({ data, error: e }) => {
        if (e) setError("Word not found.");
        else setWord(data as Word);
      });
  }, [id]);

  async function pinDate(date: string) {
    if (!word || !date) return;
    const { error: e } = await supabase().from("words").update({ due_on: date }).eq("id", word.id);
    if (e) setError(e.message);
    else {
      setWord({ ...word, due_on: date });
      setSaved(`Next review: ${dueLabel(date, today).toLowerCase()}.`);
    }
  }

  async function remove() {
    if (!word || !window.confirm(`Delete "${word.word}" and its review history? This cannot be undone.`)) return;
    const { error: e } = await supabase().from("words").delete().eq("id", word.id);
    if (e) setError(e.message);
    else router.replace("/words");
  }

  return (
    <main className="flex flex-col gap-4 px-5 pb-6 pt-[calc(16px+env(safe-area-inset-top))]">
      <Link href="/words" className="flex h-11 items-center gap-1 self-start text-[15px] font-medium text-accent">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
        My words
      </Link>

      {error && <p role="alert" className="text-due-ink">{error}</p>}
      {!word && !error && <p className="text-soft" aria-busy="true">Loading…</p>}

      {word && (
        <>
          <WordCardView card={word} note={word.note} />

          <section aria-label="Review plan" className="panel flex flex-col gap-3 p-5">
            <div className="flex items-center justify-between">
              <span className="label">Progress</span>
              <span className="text-sm font-semibold">{stageLabel(word.stage)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="label">Next review</span>
              <span className="text-sm font-semibold">{dueLabel(word.due_on, today)}</span>
            </div>
            <div className="flex flex-col gap-1.5 border-t border-hairline pt-3">
              <label htmlFor="pin" className="text-[13px] font-semibold text-soft">
                Review on a specific date (for example before an exam)
              </label>
              <input id="pin" type="date" min={today} value={word.due_on}
                onChange={(e) => pinDate(e.target.value)} className="field h-11" />
              {saved && <p role="status" className="text-sm text-good-ink">{saved}</p>}
            </div>
          </section>

          <button type="button" onClick={remove} className="btn-secondary text-due-ink">Delete word</button>
        </>
      )}
    </main>
  );
}
