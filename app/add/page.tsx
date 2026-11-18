"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { usePrefs } from "@/components/AppShell";
import DrawingPad from "@/components/DrawingPad";
import ErrorBox from "@/components/ErrorBox";
import PageHeader from "@/components/PageHeader";
import SpeakButton from "@/components/SpeakButton";
import { LANG_INFO } from "@/lib/languages";
import { supportLabel, supportName, translationFirst } from "@/lib/prefs";
import { firstDueDate, dueLabel, fullWord, todayLocal } from "@/lib/schedule";
import { api, ApiError, supabase } from "@/lib/supabase";
import { EXPRESSION_KINDS, KIND_LABEL, toExpressionKind, type Article, type Card, type ExpressionCard, type Kind, type Word } from "@/lib/types";

type Mode = "word" | "expression";
type Draft = Omit<Card, "found"> & {
  note: string;
  drawing: string | null;
  level: string;
  translation: string;
  kind: Kind;
  literal: string;
  usage: string;
  key_word: string;
};
type Recent = Pick<Word, "id" | "word" | "article" | "meaning_en" | "kind">;

/** A titled block of the card. Optional blocks can be opened and closed. */
function Section({ title, sub, children, action }: {
  title: string;
  sub?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 border-t border-hairline px-5 py-4 first:border-t-0">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="flex items-baseline gap-2">
          <span className="font-display text-base font-bold">{title}</span>
          {sub && <span className="text-xs text-muted">{sub}</span>}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export default function AddPage() {
  const prefs = usePrefs();
  const { language, level } = prefs;
  const info = LANG_INFO[language];
  const t = info.labels;
  const support = supportName(prefs);

  const [today] = useState(todayLocal);
  // /add#expression opens the expression form. (This page only renders in the browser, after sign-in.)
  const [mode, setMode] = useState<Mode>(() =>
    typeof window !== "undefined" && window.location.hash === "#expression" ? "expression" : "word",
  );
  const [input, setInput] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<"build" | "save" | null>(null);
  const [error, setError] = useState<{ err: unknown; action: "build" | "save" } | null>(null);
  const [saved, setSaved] = useState<{ text: string; href: string } | null>(null);
  const [english, setEnglish] = useState(translationFirst(prefs));
  const [extras, setExtras] = useState({ drawing: false, note: false });
  const [recent, setRecent] = useState<Recent[]>([]);

  const loadRecent = useCallback(() => {
    supabase()
      .from("words")
      .select("id, word, article, meaning_en, kind")
      .eq("language", language)
      .eq("added_on", today)
      .order("created_at", { ascending: false })
      .then(({ data }) => setRecent((data ?? []) as Recent[]));
  }, [language, today]);

  useEffect(loadRecent, [loadRecent]);

  // "Added today" shows only the kind being added: words, or expressions.
  const recentShown = recent.filter((w) => (mode === "word" ? (w.kind ?? "word") === "word" : (w.kind ?? "word") !== "word"));

  async function build(e?: React.FormEvent) {
    e?.preventDefault();
    if (!input.trim() || busy) return;
    setBusy("build");
    setError(null);
    setSaved(null);
    try {
      if (mode === "word") {
        const res = await api<{ card: Card; level: string; translation: string }>("/api/card", { word: input });
        setDraft({
          ...res.card, note: "", drawing: null, level: res.level, translation: res.translation,
          kind: "word", literal: "", usage: "", key_word: "",
        });
      } else {
        const res = await api<{ card: ExpressionCard; level: string; translation: string }>("/api/expression", { text: input });
        setDraft({
          ...res.card, kind: toExpressionKind(res.card.kind), literal: res.card.literal ?? "", usage: res.card.usage ?? "",
          key_word: res.card.key_word ?? "", article: "", forms: "", note: "", drawing: null, level: res.level, translation: res.translation,
        });
      }
      setEnglish(translationFirst(prefs));
      setExtras({ drawing: false, note: false });
    } catch (err) {
      setError({ err, action: "build" });
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!draft) return;
    // Built in the expression form = always an expression kind, built as a word = always a word.
    const kind: Kind = draft.kind === "word" ? "word" : toExpressionKind(draft.kind);
    setBusy("save");
    setError(null);
    try {
      const db = supabase();
      const { count } = await db
        .from("words")
        .select("id", { count: "exact", head: true })
        .eq("added_on", today);
      const due = firstDueDate(today, count ?? 0);
      const { data: stored, error: insertError } = await db.from("words").insert({
        word: draft.word.trim(),
        language,
        article: draft.article,
        part_of_speech: draft.part_of_speech,
        forms: draft.forms,
        meaning_nl: draft.meaning_nl,
        meaning_en: draft.meaning_en,
        examples: draft.examples.filter((x) => x.nl.trim()),
        related: draft.related,
        note: draft.note.trim(),
        level: draft.level,
        translation_lang: draft.translation,
        drawing: draft.drawing,
        kind,
        literal: (draft.literal ?? "").trim(),
        usage: (draft.usage ?? "").trim(),
        key_word: kind === "word" ? "" : (draft.key_word ?? "").trim(),
        stage: 1,
        due_on: due,
        added_on: today,
      }).select("id, kind").single();
      if (insertError) {
        throw new ApiError(
          insertError.code === "23505"
            ? `"${draft.word}" is already in your list.`
            : `This could not be saved: ${insertError.message}`,
          insertError.code === "23505" ? "duplicate" : "db",
          insertError.code !== "23505",
        );
      }
      // Check what the database really stored, so an expression can't silently land in Words.
      if (stored && (stored.kind ?? "word") !== kind) {
        throw new ApiError(
          `It was saved, but as "${stored.kind ?? "word"}" instead of "${kind}". Your database is missing the latest update: run supabase/schema.sql again in Supabase, then move it on its page.`,
          "db",
        );
      }
      setSaved({
        text: `Saved “${fullWord(draft)}” to ${kind === "word" ? "Words" : "Expressions"} in My list. First review: ${dueLabel(due, today).toLowerCase()}.`,
        href: kind === "word" ? "/words" : "/words#expressions",
      });
      setDraft(null);
      setInput("");
      loadRecent();
    } catch (err) {
      setError({ err, action: "save" });
    } finally {
      setBusy(null);
    }
  }

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }

  const articles: Article[] = [...(info.articles as Article[]), ""];
  const isExpr = draft ? draft.kind !== "word" : mode === "expression";
  const noun = mode === "word" ? "word" : "expression";

  function switchMode(next: Mode) {
    if (next === mode) return;
    setMode(next);
    setDraft(null);
    setError(null);
    setSaved(null);
    setInput("");
  }
  // The card's own translation language (the setting may change while a draft is open).
  const cardSupport = draft ? supportLabel(draft.translation) : support;

  return (
    <>
      <PageHeader />
      <main className={`flex flex-col gap-4 px-5 pt-2 ${draft ? "pb-28" : "pb-6"}`}>
        <h1 className="font-display text-[28px] font-bold">Add {mode === "word" ? "a word" : "an expression"}</h1>

        <div role="tablist" aria-label="What to add" className="grid grid-cols-2 rounded-xl bg-[#e9ebf0] p-1">
          {(["word", "expression"] as Mode[]).map((m) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => switchMode(m)}
              className={`h-10 rounded-lg text-sm font-semibold ${mode === m ? "bg-white text-ink shadow-sm" : "text-soft"}`}>
              {m === "word" ? "Word" : "Expression or sentence"}
            </button>
          ))}
        </div>

        <form onSubmit={build} className="panel flex flex-col gap-2.5 p-4">
          <label htmlFor="word" className="flex items-center gap-1.5 text-[13px] font-semibold text-soft">
            <span aria-hidden="true">{info.flag}</span>
            {mode === "word" ? `New ${info.name} word` : `${info.name} phrase, idiom, saying or sentence`}
          </label>
          {mode === "word" ? (
            <div className="flex gap-2">
              <input id="word" lang={language} autoComplete="off" autoCapitalize="none" spellCheck={false}
                enterKeyHint="go" value={input} onChange={(e) => setInput(e.target.value)} placeholder={info.placeholder}
                className="field h-12 min-w-0 flex-1 text-[17px] font-medium" />
              <button type="submit" disabled={busy !== null || !input.trim()} className="btn-primary h-12 rounded-xl px-4 text-[15px]">
                {busy === "build" ? "Building…" : draft ? "Rebuild" : "Build card"}
              </button>
            </div>
          ) : (
            <>
              <textarea id="word" lang={language} rows={2} autoCapitalize="none" spellCheck={false} maxLength={200}
                value={input} onChange={(e) => setInput(e.target.value)} placeholder={info.exprPlaceholder}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); build(); } }}
                className="field resize-none text-[17px] font-medium leading-snug" />
              <button type="submit" disabled={busy !== null || !input.trim()} className="btn-primary h-12 rounded-xl text-[15px]">
                {busy === "build" ? "Building…" : draft ? "Rebuild card" : "Build card"}
              </button>
            </>
          )}
          <p className="text-xs text-muted">Written for level {level} · translations in {support}{mode === "expression" ? " · up to 200 characters" : ""}</p>
        </form>

        {error ? <ErrorBox error={error.err} onRetry={error.action === "save" ? save : () => build()} /> : null}
        {saved && (
          <p role="status" className="rounded-xl bg-good-soft px-4 py-3 text-sm font-medium text-good-ink">
            {saved.text} <Link href={saved.href} className="font-semibold underline">Open the list</Link>
          </p>
        )}

        {busy === "build" && (
          <div className="panel flex flex-col gap-3 p-5" aria-busy="true" aria-label="Building your card">
            {[60, 90, 75, 85].map((w, i) => (
              <div key={i} className="h-4 animate-pulse rounded bg-hairline" style={{ width: `${w}%` }} />
            ))}
          </div>
        )}

        {draft && busy !== "build" && (
          <article aria-label={`New ${noun} card`} className="panel overflow-hidden">
            {/* The word itself */}
            <div className="flex flex-col gap-3 bg-accent-soft/50 px-5 py-4">
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-muted">Check the card, then save it.</span>
                <button type="button" className="btn-small" aria-pressed={english} onClick={() => setEnglish(!english)}>
                  {english ? `Hide ${cardSupport}` : `Show ${cardSupport}`}
                </button>
              </div>
              {isExpr && (
                <div role="radiogroup" aria-label="Kind of expression" className="flex flex-wrap gap-1.5">
                  {EXPRESSION_KINDS.map((k) => (
                    <button key={k} type="button" role="radio" aria-checked={draft.kind === k}
                      onClick={() => update("kind", k)}
                      className={`h-9 rounded-lg border px-3 text-sm font-semibold ${draft.kind === k ? "border-ink bg-ink text-white" : "border-line bg-white"}`}>
                      {KIND_LABEL[k]}
                    </button>
                  ))}
                </div>
              )}
              {!isExpr && info.articles.length > 0 && (
                <div role="radiogroup" aria-label={t.article} className="flex gap-1.5">
                  {articles.map((a) => (
                    <button key={a || "none"} type="button" role="radio" aria-checked={draft.article === a}
                      onClick={() => update("article", a)}
                      className={`h-9 min-w-12 rounded-lg border px-3 text-[15px] font-semibold ${draft.article === a ? "border-ink bg-ink text-white" : "border-line bg-white"}`}>
                      {a || "none"}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
                <label htmlFor="base" className="sr-only">{t.word}</label>
                {isExpr ? (
                  <textarea id="base" lang={language} rows={2} value={draft.word} onChange={(e) => update("word", e.target.value)}
                    className="field min-w-0 flex-1 resize-none font-display text-xl font-bold leading-snug" />
                ) : (
                  <input id="base" lang={language} value={draft.word} onChange={(e) => update("word", e.target.value)}
                    className="field h-14 min-w-0 flex-1 font-display text-2xl font-bold" />
                )}
                <SpeakButton text={fullWord(draft)} />
              </div>
              {isExpr && (
                <div className="flex items-center gap-2">
                  <label htmlFor="key" className="shrink-0 text-xs font-semibold text-muted">Key part</label>
                  <input id="key" lang={language} value={draft.key_word} onChange={(e) => update("key_word", e.target.value)}
                    className="field h-9 text-[15px]" />
                </div>
              )}
              {isExpr && draft.key_word && !draft.word.toLowerCase().includes(draft.key_word.toLowerCase()) && (
                <p className="-mt-1 text-xs text-due-ink">The key part must appear in the expression, so exercises can hide it.</p>
              )}
              {!isExpr && (draft.part_of_speech || draft.forms) && (
                <div lang={language} className="flex flex-wrap gap-1.5 text-xs">
                  {[draft.part_of_speech, ...draft.forms.split("·")].map((x) => x.trim()).filter(Boolean).map((x) => (
                    <span key={x} className="rounded-full bg-white px-2.5 py-1 text-soft">{x}</span>
                  ))}
                </div>
              )}
            </div>

            <Section title={t.meaning} sub={info.native}>
              <label htmlFor="meaning" className="sr-only">{t.inLanguage}</label>
              <textarea id="meaning" lang={language} rows={2} value={draft.meaning_nl}
                onChange={(e) => update("meaning_nl", e.target.value)} className="field resize-none leading-snug" />
              {english && (
                <div className="flex items-center gap-2">
                  <label htmlFor="english" className="w-16 shrink-0 text-xs font-semibold text-muted">{cardSupport}</label>
                  <input id="english" value={draft.meaning_en} onChange={(e) => update("meaning_en", e.target.value)}
                    className="field h-10 text-[15px]" />
                </div>
              )}
              {isExpr && (draft.kind === "idiom" || draft.kind === "saying" || draft.literal) && (
                <div className="flex items-center gap-2">
                  <label htmlFor="literal" className="w-16 shrink-0 text-xs font-semibold text-muted">Literally</label>
                  <input id="literal" value={draft.literal} onChange={(e) => update("literal", e.target.value)}
                    className="field h-10 text-[15px] italic" />
                </div>
              )}
              {isExpr && (
                <div className="flex flex-col gap-1">
                  <label htmlFor="usage" className="text-xs font-semibold text-muted">When to use it</label>
                  <textarea id="usage" rows={2} value={draft.usage} onChange={(e) => update("usage", e.target.value)}
                    placeholder="Formal or informal, spoken or written…" className="field resize-none text-[15px]" />
                </div>
              )}
            </Section>

            <Section title={t.examples} sub={`${draft.examples.length}`}
              action={draft.examples.length < 6 && (
                <button type="button" className="btn-small"
                  onClick={() => update("examples", [...draft.examples, { nl: "", en: "" }])}>+ My sentence</button>
              )}>
              <ol className="flex flex-col gap-2.5">
                {draft.examples.map((ex, i) => (
                  <li key={i} className="flex flex-col gap-1">
                    <div className="flex items-start gap-1.5">
                      <label htmlFor={`ex-${i}`} className="sr-only">Sentence {i + 1}</label>
                      <textarea id={`ex-${i}`} lang={language} rows={2} value={ex.nl}
                        placeholder={i >= 2 && !ex.nl ? "Write your own sentence with the word" : undefined}
                        onChange={(e) => update("examples", draft.examples.map((x, j) => (j === i ? { ...x, nl: e.target.value } : x)))}
                        className="field min-w-0 flex-1 resize-none text-[15px] leading-normal" />
                      <div className="flex flex-col">
                        <SpeakButton text={ex.nl} label={`Play sentence ${i + 1}`} small />
                        <button type="button" aria-label={`Remove sentence ${i + 1}`}
                          onClick={() => update("examples", draft.examples.filter((_, j) => j !== i))}
                          className="flex h-9 w-9 items-center justify-center rounded-full text-lg text-muted">×</button>
                      </div>
                    </div>
                    {english && ex.en && <p className="px-1 text-[13px] text-muted">{ex.en}</p>}
                  </li>
                ))}
              </ol>
            </Section>

            {draft.related.length > 0 && (
              <Section title={isExpr ? "Similar expressions" : t.related} sub="tap × to remove">
                <ul lang={language} className="flex flex-wrap gap-1.5">
                  {draft.related.map((r, i) => (
                    <li key={i} className="flex items-center gap-1 rounded-full bg-[#f0f1f4] py-1 pl-3 pr-1 text-sm">
                      {r.word}<span className="text-muted"> · {english ? r.en : r.relation}</span>
                      <button type="button" aria-label={`Remove ${r.word}`}
                        onClick={() => update("related", draft.related.filter((_, j) => j !== i))}
                        className="flex h-7 w-7 items-center justify-center rounded-full text-muted">×</button>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {extras.drawing ? (
              <Section title={t.drawing} sub="optional"
                action={<button type="button" className="btn-small" onClick={() => setExtras({ ...extras, drawing: false })}>Done</button>}>
                <DrawingPad initial={draft.drawing} onChange={(d) => update("drawing", d)} />
              </Section>
            ) : null}
            {extras.note ? (
              <Section title={t.note} sub="optional">
                <label htmlFor="note" className="sr-only">{t.note}</label>
                <textarea id="note" rows={2} value={draft.note} placeholder="Where did you meet this word?" autoFocus
                  onChange={(e) => update("note", e.target.value)} className="field resize-none text-[15px]" />
              </Section>
            ) : null}
            {(!extras.drawing || !extras.note) && (
              <div className="flex flex-wrap items-center gap-2 border-t border-hairline px-5 py-4">
                {!extras.drawing && (
                  <button type="button" className="btn-small" onClick={() => setExtras({ ...extras, drawing: true })}>
                    {draft.drawing ? (
                      // eslint-disable-next-line @next/next/no-img-element -- a local data URL
                      <img src={draft.drawing} alt="" className="h-6 w-6 rounded border border-hairline bg-white" />
                    ) : "✎"}
                    {draft.drawing ? "Edit drawing" : "Add a drawing"}
                  </button>
                )}
                {!extras.note && (
                  <button type="button" className="btn-small" onClick={() => setExtras({ ...extras, note: true })}>
                    + Add a note
                  </button>
                )}
              </div>
            )}
          </article>
        )}

        {!draft && busy !== "build" && (
          <>
            {recentShown.length > 0 && (
              <section aria-labelledby="today-title" className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between px-1">
                  <h2 id="today-title" className="text-sm font-semibold text-soft">{mode === "word" ? "Words" : "Expressions"} added today · {recentShown.length}</h2>
                  <Link href={mode === "word" ? "/words" : "/words#expressions"} className="text-sm font-medium text-accent">
                    See all
                  </Link>
                </div>
                <ul className="panel overflow-hidden">
                  {recentShown.slice(0, 8).map((w) => (
                    <li key={w.id} className="border-b border-hairline last:border-b-0">
                      <Link href={`/words/${w.id}`} className="flex items-center justify-between gap-3 px-4 py-3">
                        <span lang={language} className="flex min-w-0 items-center gap-2 font-semibold">
                          <span className="truncate">{fullWord(w)}</span>
                          {w.kind && w.kind !== "word" && (
                            <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent-dark">
                              {KIND_LABEL[w.kind]}
                            </span>
                          )}
                        </span>
                        <span className="truncate text-sm text-muted">{w.meaning_en.split(";")[0]}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <p className="px-1 text-[15px] leading-relaxed text-soft">
              {mode === "word"
                ? "Type a word you met today. Word Buddy builds the card — meaning, examples and related words — and reminds you until you know it. You can add your own sentences and a drawing too."
                : "Type a phrase, idiom, saying or a whole sentence you want to remember. Word Buddy explains what it means, what it means literally, when to use it, and gives examples. You practise it like a word."}
            </p>
          </>
        )}
      </main>

      {draft && busy !== "build" && (
        <div className="fixed inset-x-0 bottom-[calc(72px+env(safe-area-inset-bottom))] z-10 border-t border-hairline bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-md gap-2 px-5 py-3">
            <button type="button" onClick={() => { setDraft(null); setError(null); }} className="btn-secondary h-12">Discard</button>
            <button type="button" onClick={save} disabled={busy !== null || !draft.word.trim()} className="btn-primary h-12 flex-1">
              {busy === "save" ? "Saving…" : isExpr ? "Save expression" : "Save word"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
