"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import DrawingPad from "@/components/DrawingPad";
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
  const [sketch, setSketch] = useState<string | null | undefined>(undefined); // undefined = pad closed
  const [sketchMessage, setSketchMessage] = useState<string | null>(null);

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

  async function saveDrawing() {
    if (!word || sketch === undefined) return;
    const { error: e } = await supabase().from("words").update({ drawing: sketch }).eq("id", word.id);
    if (e) setSketchMessage(e.message);
    else {
      setWord({ ...word, drawing: sketch });
      setSketch(undefined);
      setSketchMessage(sketch ? "Drawing saved." : "Drawing removed.");
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
          <WordCardView card={word} note={word.note} level={word.level} />

          <section aria-labelledby="drawing-title" className="panel flex flex-col gap-3 p-5">
            <h2 id="drawing-title" className="label">Mijn tekening</h2>
            {sketch !== undefined ? (
              <>
                <DrawingPad initial={word.drawing} onChange={setSketch} />
                <div className="flex gap-2">
                  <button type="button" className="btn-primary flex-1" onClick={saveDrawing}>Save drawing</button>
                  <button type="button" className="btn-secondary" onClick={() => setSketch(undefined)}>Cancel</button>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-3">
                {word.drawing ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a data URL from the database
                  <img src={word.drawing} alt={`Your drawing for ${word.word}`}
                    className="aspect-square w-32 rounded-xl border border-hairline bg-white" />
                ) : (
                  <p className="flex-1 text-[15px] text-soft">Draw something that reminds you of this word.</p>
                )}
                <button type="button" className="btn-secondary" onClick={() => { setSketch(word.drawing); setSketchMessage(null); }}>
                  {word.drawing ? "Edit drawing" : "Draw it"}
                </button>
              </div>
            )}
            {sketchMessage && <p role="status" className="text-sm text-good-ink">{sketchMessage}</p>}
          </section>

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
