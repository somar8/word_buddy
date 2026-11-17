"use client";

import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import SpeakButton from "@/components/SpeakButton";
import { firstDueDate, dueLabel, todayLocal } from "@/lib/schedule";
import { api, supabase } from "@/lib/supabase";
import type { Article, Card } from "@/lib/types";

type Draft = Omit<Card, "found"> & { note: string };

export default function AddPage() {
  const [input, setInput] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<"build" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [english, setEnglish] = useState(false);

  async function build(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    setBusy("build");
    setError(null);
    setSaved(null);
    try {
      const { card } = await api<{ card: Card }>("/api/card", { word: input });
      setDraft({ ...card, note: "" });
      setEnglish(false);
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

  return (
    <>
      <PageHeader />
      <main className="flex flex-col gap-4 px-5 pb-6 pt-2">
        <h1 className="font-display text-[28px] font-bold">Add a word</h1>

        <form onSubmit={build} className="flex flex-col gap-1.5">
          <label htmlFor="word" className="text-[13px] font-semibold text-soft">New Dutch word</label>
          <div className="flex gap-2">
            <input id="word" lang="nl" autoComplete="off" autoCapitalize="none" spellCheck={false}
              value={input} onChange={(e) => setInput(e.target.value)} placeholder="bijvoorbeeld: afspraak"
              className="field h-12 min-w-0 flex-1 text-[17px] font-medium" />
            <button type="submit" disabled={busy !== null || !input.trim()} className="btn-primary h-12 rounded-xl text-[15px]">
              {busy === "build" ? "Building…" : "Build card"}
            </button>
          </div>
        </form>

        {error && <p role="alert" className="rounded-xl bg-due-soft px-4 py-3 text-sm text-due-ink">{error}</p>}
        {saved && <p role="status" className="rounded-xl bg-good-soft px-4 py-3 text-sm font-medium text-good-ink">{saved}</p>}

        {draft && (
          <>
            <section aria-label="New word card" className="panel flex flex-col gap-4 p-5">
              <p className="text-[13px] text-muted">Check the card and fix anything that looks wrong before saving.</p>

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
                <SpeakButton text={draft.article ? `${draft.article} ${draft.word}` : draft.word} />
              </div>
              <p lang="nl" className="-mt-2 text-[13px] text-muted">
                {[draft.part_of_speech, draft.forms].filter(Boolean).join(" · ")}
              </p>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="meaning" className="label">Betekenis</label>
                <textarea id="meaning" lang="nl" rows={2} value={draft.meaning_nl}
                  onChange={(e) => update("meaning_nl", e.target.value)} className="field resize-none leading-snug" />
                {english ? (
                  <>
                    <label htmlFor="english" className="sr-only">English translation</label>
                    <input id="english" value={draft.meaning_en} onChange={(e) => update("meaning_en", e.target.value)}
                      className="field h-11 text-[15px]" />
                  </>
                ) : (
                  <button type="button" className="btn-small self-start" onClick={() => setEnglish(true)}>Show English</button>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <span className="label">Voorbeelden</span>
                {draft.examples.map((ex, i) => (
                  <div key={i} className="flex flex-col gap-1">
                    <label htmlFor={`ex-${i}`} className="sr-only">Example {i + 1}</label>
                    <textarea id={`ex-${i}`} lang="nl" rows={2} value={ex.nl}
                      onChange={(e) => update("examples", draft.examples.map((x, j) => (j === i ? { ...x, nl: e.target.value } : x)))}
                      className="field resize-none text-[15px] leading-normal" />
                    {english && <p className="px-1 text-[13px] text-muted">{ex.en}</p>}
                  </div>
                ))}
              </div>

              {draft.related.length > 0 && (
                <div className="flex flex-col gap-2">
                  <span className="label">Verwante woorden</span>
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
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label htmlFor="note" className="label">Mijn notitie</label>
                <textarea id="note" rows={2} value={draft.note} placeholder="Where did you meet this word?"
                  onChange={(e) => update("note", e.target.value)} className="field resize-none text-[15px]" />
              </div>
            </section>

            <div className="flex flex-col gap-2">
              <button type="button" onClick={save} disabled={busy !== null || !draft.word.trim()} className="btn-primary">
                {busy === "save" ? "Saving…" : "Save to my words"}
              </button>
              <button type="button" onClick={() => setDraft(null)} className="btn-secondary">Discard</button>
            </div>
          </>
        )}

        {!draft && !busy && (
          <p className="text-[15px] leading-relaxed text-soft">
            Type a word you met today. Word Buddy builds the card — meaning in simple Dutch, examples and
            related words — and reminds you until you know it.
          </p>
        )}
      </main>
    </>
  );
}
