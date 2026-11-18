"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { usePrefs } from "@/components/AppShell";
import ConfirmDialog from "@/components/ConfirmDialog";
import DrawingPad from "@/components/DrawingPad";
import SentenceEditor from "@/components/SentenceEditor";
import WordCardView from "@/components/WordCardView";
import { dueLabel, stageLabel, todayLocal } from "@/lib/schedule";
import { defaultSupport, toLang } from "@/lib/languages";
import { supportLabel } from "@/lib/prefs";
import { api, supabase } from "@/lib/supabase";
import { keyPart } from "@/lib/practice";
import { KIND_LABEL, type Kind, type Word } from "@/lib/types";

const ALL_KINDS: Kind[] = ["word", "phrase", "idiom", "saying", "sentence"];

export default function WordPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [today] = useState(todayLocal);
  const [word, setWord] = useState<Word | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [kindMessage, setKindMessage] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const prefs = usePrefs();
  const [translating, setTranslating] = useState(false);
  const [translateMessage, setTranslateMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [version, setVersion] = useState(0); // bump to reload the card after re-translating
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
  }, [id, version]);

  /** Moves the item between the Words and Expressions lists (or changes the kind of expression). */
  async function changeKind(kind: Kind) {
    if (!word || kind === word.kind) return;
    const key_word = kind === "word" ? "" : keyPart(word.word, word.key_word ?? "");
    const { error: e } = await supabase().from("words").update({ kind, key_word }).eq("id", word.id);
    if (e) setKindMessage(`Could not change it: ${e.message}`);
    else {
      const moved = (word.kind === "word") !== (kind === "word");
      setWord({ ...word, kind, key_word });
      setKindMessage(moved ? `Moved to ${kind === "word" ? "Words" : "Expressions"} in My list.` : `Now marked as ${KIND_LABEL[kind].toLowerCase()}.`);
    }
  }

  /** Rewrites this card's translations in the language chosen for its learning language. */
  async function retranslate() {
    if (!word) return;
    setTranslating(true);
    setTranslateMessage(null);
    try {
      const res = await api<{ updated: number; translation: string }>("/api/retranslate", { ids: [word.id] });
      if (res.updated === 1) {
        setTranslateMessage({ ok: true, text: `Translations are now in ${supportLabel(res.translation)}.` });
        setVersion((v) => v + 1);
      } else {
        setTranslateMessage({ ok: false, text: "The AI answer didn't match this card, so nothing changed. Try again." });
      }
    } catch (err) {
      setTranslateMessage({ ok: false, text: (err as Error).message });
    } finally {
      setTranslating(false);
    }
  }

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

  async function remove(): Promise<string | null> {
    if (!word) return null;
    const { error: e } = await supabase().from("words").delete().eq("id", word.id);
    if (e) return `It was not deleted: ${e.message}`;
    router.replace(word.kind !== "word" ? "/words#expressions" : "/words");
    return null;
  }

  return (
    <main className="flex flex-col gap-4 px-5 pb-6 pt-[calc(16px+env(safe-area-inset-top))]">
      <Link href={word && word.kind !== "word" ? "/words#expressions" : "/words"}
        className="flex h-11 items-center gap-1 self-start text-[15px] font-medium text-accent">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
        My list
      </Link>

      {error && <p role="alert" className="text-due-ink">{error}</p>}
      {!word && !error && <p className="text-soft" aria-busy="true">Loading…</p>}

      {word && (
        <>
          <WordCardView card={{ ...word, examples: [] }} note={word.note} level={word.level} language={word.language} translation={word.translation_lang} />

          <SentenceEditor word={word} onChange={(examples) => setWord({ ...word, examples })} />

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

          <section aria-labelledby="kind-title" className="panel flex flex-col gap-2 p-5">
            <div className="flex items-center justify-between gap-3">
              <label id="kind-title" htmlFor="kind" className="label">Kept in</label>
              <select id="kind" value={word.kind ?? "word"} onChange={(e) => changeKind(e.target.value as Kind)}
                className="field h-10 w-auto py-0 text-[15px]">
                <option value="word">Words · single word</option>
                {ALL_KINDS.filter((k) => k !== "word").map((k) => (
                  <option key={k} value={k}>Expressions · {KIND_LABEL[k].toLowerCase()}</option>
                ))}
              </select>
            </div>
            {kindMessage && <p role="status" className="text-sm text-good-ink">{kindMessage}</p>}
            {(() => {
              const lang = toLang(word.language) ?? prefs.language;
              const wanted = prefs.supports[lang] ?? defaultSupport(lang);
              const differs = (word.translation_lang ?? "en") !== wanted;
              return (
                <div className="flex items-center justify-between gap-3 border-t border-hairline pt-2.5">
                  <span className="text-sm">
                    <span className="text-muted">Translations in </span>
                    <strong className={differs ? "text-due-ink" : ""}>{supportLabel(word.translation_lang)}</strong>
                  </span>
                  <button type="button" className="btn-small shrink-0" disabled={translating} onClick={retranslate}>
                    {translating ? "Translating…" : differs ? `Translate into ${supportLabel(wanted)}` : "Redo translation"}
                  </button>
                </div>
              );
            })()}
            {translateMessage && (
              <p role="status" className={`text-sm ${translateMessage.ok ? "text-good-ink" : "text-due-ink"}`}>{translateMessage.text}</p>
            )}
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

          <button type="button" onClick={() => setConfirming(true)} className="btn-secondary text-due-ink">
            Delete {word.kind !== "word" ? "expression" : "word"}
          </button>
          <ConfirmDialog open={confirming} onCancel={() => setConfirming(false)} onConfirm={remove}
            title={`Delete this ${word.kind !== "word" ? "expression" : "word"}?`} confirmLabel="Delete for good"
            body={<>
              <span lang={word.language} className="mb-2 block font-medium text-ink">{word.word}</span>
              Its card, your sentences, drawing and review history are removed. This cannot be undone.
            </>} />
        </>
      )}
    </main>
  );
}
