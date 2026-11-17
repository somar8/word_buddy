"use client";

import { useState } from "react";
import { useLevel } from "@/components/AppShell";
import DrawingPad from "@/components/DrawingPad";
import PageHeader from "@/components/PageHeader";
import SpeakButton from "@/components/SpeakButton";
import { englishFirst } from "@/lib/levels";
import { firstDueDate, dueLabel, todayLocal } from "@/lib/schedule";
import { api, supabase } from "@/lib/supabase";
import type { Article, Card } from "@/lib/types";

type Draft = Omit<Card, "found"> & { note: string; drawing: string | null; level: string };

/** One clearly separated part of the card, with a number, a Dutch title and an English subtitle. */
function Section({ n, title, sub, optional, children }: {
  n: number;
  title: string;
  sub: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  const id = `section-${n}`;
  return (
    <section aria-labelledby={id} className="panel flex flex-col gap-3 p-5">
      <div className="flex items-center gap-3 border-b border-hairline pb-3">
        <span aria-hidden="true"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[13px] font-bold text-accent-dark">
          {n}
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 id={id} className="font-display text-[17px] font-bold leading-tight">{title}</h2>
          <span className="text-xs text-muted">{sub}</span>
        </div>
        {optional && <span className="rounded-full bg-[#f0f1f4] px-2 py-0.5 text-[11px] font-semibold text-muted">Optional</span>}
      </div>
      {children}
    </section>
  );
}

export default function AddPage() {
  const level = useLevel();
  const [input, setInput] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<"build" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [english, setEnglish] = useState(englishFirst(level));
  const [drawing, setDrawing] = useState(false);

  async function build(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    setBusy("build");
    setError(null);
    setSaved(null);
    try {
      const { card, level: cardLevel } = await api<{ card: Card; level: string }>("/api/card", { word: input });
      setDraft({ ...card, note: "", drawing: null, level: cardLevel });
      setEnglish(englishFirst(level));
      setDrawing(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!draft) return;
    setBusy("save");
    setError(null);
    try {
      const db = supabase();
      const today = todayLocal();
      const { count } = await db
        .from("words")
        .select("id", { count: "exact", head: true })
        .eq("added_on", today);
      const due = firstDueDate(today, count ?? 0);
      const { error: insertError } = await db.from("words").insert({
        word: draft.word.trim(),
        article: draft.article,
        part_of_speech: draft.part_of_speech,
        forms: draft.forms,
        meaning_nl: draft.meaning_nl,
        meaning_en: draft.meaning_en,
        examples: draft.examples.filter((x) => x.nl.trim()),
        related: draft.related,
        note: draft.note.trim(),
        level: draft.level,
        drawing: draft.drawing,
        stage: 1,
        due_on: due,
        added_on: today,
      });
      if (insertError) {
        throw new Error(
          insertError.code === "23505" ? `"${draft.word}" is already in your words.` : insertError.message,
        );
      }
      setSaved(`Saved! First review: ${dueLabel(due, today).toLowerCase()}.`);
      setDraft(null);
      setInput("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }

  const full = draft ? (draft.article ? `${draft.article} ${draft.word}` : draft.word) : "";

  return (
    <>
      <PageHeader />
      <main className="flex flex-col gap-4 px-5 pb-6 pt-2">
        <h1 className="font-display text-[28px] font-bold">Add a word</h1>

        <form onSubmit={build} className="panel flex flex-col gap-2 p-5">
          <label htmlFor="word" className="text-[13px] font-semibold text-soft">New Dutch word</label>
          <div className="flex gap-2">
            <input id="word" lang="nl" autoComplete="off" autoCapitalize="none" spellCheck={false}
              value={input} onChange={(e) => setInput(e.target.value)} placeholder="bijvoorbeeld: afspraak"
              className="field h-12 min-w-0 flex-1 text-[17px] font-medium" />
            <button type="submit" disabled={busy !== null || !input.trim()} className="btn-primary h-12 rounded-xl text-[15px]">
              {busy === "build" ? "Building…" : "Build card"}
            </button>
          </div>
          <p className="text-xs text-muted">The card is written for your level ({level}).</p>
        </form>

        {error && <p role="alert" className="rounded-xl bg-due-soft px-4 py-3 text-sm text-due-ink">{error}</p>}
        {saved && <p role="status" className="rounded-xl bg-good-soft px-4 py-3 text-sm font-medium text-good-ink">{saved}</p>}

        {draft && (
          <>
            <div className="flex items-center justify-between gap-3 px-1">
              <p className="text-[13px] text-muted">Check each part and fix anything that looks wrong.</p>
              <button type="button" className="btn-small shrink-0" aria-pressed={english} onClick={() => setEnglish(!english)}>
                {english ? "Hide English" : "Show English"}
              </button>
            </div>

            <Section n={1} title="Het woord" sub="The word">
              <div className="flex items-end gap-2">
                <div className="flex flex-col gap-1">
                  <label htmlFor="article" className="label">Lidwoord</label>
                  <select id="article" value={draft.article}
                    onChange={(e) => update("article", e.target.value as Article)}
                    className="field h-12 w-[84px] px-2 font-display text-xl">
                    <option value="de">de</option>
                    <option value="het">het</option>
                    <option value="">—</option>
                  </select>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <label htmlFor="base" className="label">Woord</label>
                  <input id="base" lang="nl" value={draft.word} onChange={(e) => update("word", e.target.value)}
                    className="field h-12 font-display text-xl font-bold" />
                </div>
                <SpeakButton text={full} />
              </div>
              {(draft.part_of_speech || draft.forms) && (
                <dl lang="nl" className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-xl bg-ground px-3.5 py-2.5 text-[13px]">
                  {draft.part_of_speech && (<><dt className="text-muted">Soort</dt><dd>{draft.part_of_speech}</dd></>)}
                  {draft.forms && (<><dt className="text-muted">Vormen</dt><dd>{draft.forms}</dd></>)}
                </dl>
              )}
            </Section>

            <Section n={2} title="Betekenis" sub="Meaning">
              <div className="flex flex-col gap-1">
                <label htmlFor="meaning" className="label">In het Nederlands</label>
                <textarea id="meaning" lang="nl" rows={2} value={draft.meaning_nl}
                  onChange={(e) => update("meaning_nl", e.target.value)} className="field resize-none leading-snug" />
              </div>
              {english && (
                <div className="flex flex-col gap-1">
                  <label htmlFor="english" className="label">In English</label>
                  <input id="english" value={draft.meaning_en} onChange={(e) => update("meaning_en", e.target.value)}
                    className="field h-11 text-[15px]" />
                </div>
              )}
            </Section>

            <Section n={3} title="Voorbeelden" sub="Example sentences">
              <ol className="flex flex-col gap-3">
                {draft.examples.map((ex, i) => (
                  <li key={i} className="flex flex-col gap-1.5 rounded-xl border border-hairline p-3">
                    <div className="flex items-center justify-between">
                      <label htmlFor={`ex-${i}`} className="text-xs font-semibold text-muted">Sentence {i + 1}</label>
                      <div className="flex items-center gap-1">
                        <SpeakButton text={ex.nl} label={`Play sentence ${i + 1}`} small />
                        <button type="button" aria-label={`Remove sentence ${i + 1}`}
                          onClick={() => update("examples", draft.examples.filter((_, j) => j !== i))}
                          className="flex h-9 w-9 items-center justify-center rounded-full text-lg text-muted">×</button>
                      </div>
                    </div>
                    <textarea id={`ex-${i}`} lang="nl" rows={2} value={ex.nl}
                      onChange={(e) => update("examples", draft.examples.map((x, j) => (j === i ? { ...x, nl: e.target.value } : x)))}
                      className="field resize-none text-[15px] leading-normal" />
                    {english && ex.en && <p className="px-1 text-[13px] text-muted">{ex.en}</p>}
                  </li>
                ))}
              </ol>
              {draft.examples.length < 5 && (
                <button type="button" className="btn-small self-start"
                  onClick={() => update("examples", [...draft.examples, { nl: "", en: "" }])}>
                  + Add my own sentence
                </button>
              )}
            </Section>

            <Section n={4} title="Verwante woorden" sub="Synonyms, opposites and word family">
              {draft.related.length > 0 ? (
                <ul lang="nl" className="flex flex-wrap gap-2">
                  {draft.related.map((r, i) => (
                    <li key={i} className="flex items-center gap-1 rounded-full bg-[#f0f1f4] py-1 pl-3 pr-1 text-sm">
                      {r.word}<span className="text-muted"> · {english ? r.en : r.relation}</span>
                      <button type="button" aria-label={`Remove ${r.word}`}
                        onClick={() => update("related", draft.related.filter((_, j) => j !== i))}
                        className="flex h-7 w-7 items-center justify-center rounded-full text-muted">×</button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">No related words.</p>
              )}
            </Section>

            <Section n={5} title="Tekening" sub="Draw something that reminds you of the word" optional>
              {drawing ? (
                <>
                  <DrawingPad initial={draft.drawing} onChange={(d) => update("drawing", d)} />
                  <button type="button" className="btn-small self-start" onClick={() => setDrawing(false)}>Close drawing pad</button>
                </>
              ) : (
                <div className="flex items-center gap-3">
                  {draft.drawing && (
                    // eslint-disable-next-line @next/next/no-img-element -- a local data URL
                    <img src={draft.drawing} alt="Your drawing" className="h-20 w-20 rounded-xl border border-hairline bg-white" />
                  )}
                  <button type="button" className="btn-secondary" onClick={() => setDrawing(true)}>
                    {draft.drawing ? "Edit drawing" : "Draw it"}
                  </button>
                </div>
              )}
            </Section>

            <Section n={6} title="Mijn notitie" sub="Your own note" optional>
              <label htmlFor="note" className="sr-only">Note</label>
              <textarea id="note" rows={2} value={draft.note} placeholder="Where did you meet this word?"
                onChange={(e) => update("note", e.target.value)} className="field resize-none text-[15px]" />
            </Section>

            <div className="flex flex-col gap-2">
              <button type="button" onClick={save} disabled={busy !== null || !draft.word.trim()} className="btn-primary">
                {busy === "save" ? "Saving…" : "Save to my words"}
              </button>
              <button type="button" onClick={() => setDraft(null)} className="btn-secondary">Discard</button>
            </div>
          </>
        )}

        {!draft && !busy && (
          <p className="px-1 text-[15px] leading-relaxed text-soft">
            Type a word you met today. Word Buddy builds the card — meaning, examples and related words — and
            reminds you until you know it. You can add your own drawing too.
          </p>
        )}
      </main>
    </>
  );
}
