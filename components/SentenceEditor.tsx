"use client";

import { useState } from "react";
import { LANG_INFO, toLang } from "@/lib/languages";
import { supportLabel } from "@/lib/prefs";
import { api, supabase } from "@/lib/supabase";
import type { Example, SentenceCheck, Word } from "@/lib/types";
import { usePrefs } from "./AppShell";
import ErrorBox from "./ErrorBox";
import SpeakButton from "./SpeakButton";

const MAX_SENTENCES = 10;

/**
 * Your own example sentences for a saved word: write one, let the AI check it (optional),
 * and keep the corrected version. You can also remove sentences.
 */
export default function SentenceEditor({ word, onChange }: {
  word: Pick<Word, "id" | "word" | "examples" | "language" | "translation_lang">;
  onChange: (examples: Example[]) => void;
}) {
  const prefs = usePrefs();
  const lang = toLang(word.language) ?? prefs.language;
  const [text, setText] = useState("");
  const [check, setCheck] = useState<SentenceCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function store(examples: Example[], message: string) {
    setBusy(true);
    const { error: e } = await supabase().from("words").update({ examples }).eq("id", word.id);
    setBusy(false);
    if (e) {
      setError(new Error(`The sentence could not be saved: ${e.message}`));
      return;
    }
    onChange(examples);
    setNotice(message);
    setText("");
    setCheck(null);
  }

  async function runCheck(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await api<{ check: SentenceCheck }>("/api/check-sentence", { wordId: word.id, sentence: text });
      setCheck(res.check);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  function add(sentence: string, translation: string) {
    if (word.examples.some((x) => x.nl.trim() === sentence.trim())) {
      setNotice("That sentence is already on the card.");
      return;
    }
    store([...word.examples, { nl: sentence.trim(), en: translation }], "Sentence added. It can show up in your reviews.");
  }

  const full = word.examples.length >= MAX_SENTENCES;

  return (
    <section aria-labelledby="sentences-title" className="panel flex flex-col gap-3 p-5">
      <div className="flex items-baseline justify-between">
        <h2 id="sentences-title" className="label">{LANG_INFO[lang].labels.examples}</h2>
        <span className="text-xs text-muted">{word.examples.length} / {MAX_SENTENCES}</span>
      </div>

      {word.examples.length > 0 && (
        <ul className="flex flex-col divide-y divide-hairline">
          {word.examples.map((ex, i) => (
            <li key={i} className="flex items-start gap-2 py-2">
              <div className="min-w-0 flex-1">
                <p lang={lang} className="text-[15px] leading-normal">{ex.nl}</p>
                {ex.en && <p className="text-[13px] text-muted">{ex.en}</p>}
              </div>
              <SpeakButton text={ex.nl} label={`Play sentence ${i + 1}`} small />
              <button type="button" aria-label={`Remove sentence ${i + 1}`} disabled={busy}
                onClick={() => store(word.examples.filter((_, j) => j !== i), "Sentence removed.")}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg text-muted">×</button>
            </li>
          ))}
        </ul>
      )}

      {full ? (
        <p className="text-sm text-muted">This card has the maximum of {MAX_SENTENCES} sentences. Remove one to add another.</p>
      ) : (
        <form onSubmit={runCheck} className="flex flex-col gap-2 border-t border-hairline pt-3">
          <label htmlFor="new-sentence" className="text-[13px] font-semibold text-soft">
            Add your own sentence with <span lang={lang} className="text-ink">{word.word}</span>
          </label>
          <textarea id="new-sentence" lang={lang} rows={2} value={text} disabled={busy}
            onChange={(e) => { setText(e.target.value); setCheck(null); setNotice(null); }}
            className="field resize-none text-[15px]" />

          {check && (
            <div role="status"
              className={`flex flex-col gap-1.5 rounded-xl px-4 py-3 text-sm ${check.correct ? "bg-good-soft text-good-ink" : "bg-due-soft text-due-ink"}`}>
              <strong>{check.correct ? LANG_INFO[lang].labels.wellDone : "Almost — here is a fix"}</strong>
              <span lang={lang}>{check.feedback_nl}</span>
              <span className="opacity-80">{check.feedback_en}</span>
              {!check.correct && <span lang={lang} className="font-semibold">{check.corrected}</span>}
            </div>
          )}

          {check ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-primary h-11 flex-1" disabled={busy}
                onClick={() => add(check.corrected, check.translation)}>
                {check.correct ? "Add to the card" : "Add the corrected sentence"}
              </button>
              {!check.correct && (
                <button type="button" className="btn-secondary h-11" disabled={busy} onClick={() => add(text, "")}>
                  Add mine anyway
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button type="submit" className="btn-primary h-11 flex-1" disabled={busy || !text.trim()}>
                {busy ? "Checking…" : "Check and add"}
              </button>
              <button type="button" className="btn-secondary h-11" disabled={busy || !text.trim()} onClick={() => add(text, "")}>
                Add without check
              </button>
            </div>
          )}
          <p className="text-xs text-muted">The check also adds a {supportLabel(word.translation_lang)} translation, like the rest of this card.</p>
        </form>
      )}
      {error ? <ErrorBox error={error} onRetry={() => setError(null)} /> : null}
      {notice && <p role="status" className="text-sm text-good-ink">{notice}</p>}
    </section>
  );
}
