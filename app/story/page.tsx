"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePrefs } from "@/components/AppShell";
import ErrorBox from "@/components/ErrorBox";
import PageHeader from "@/components/PageHeader";
import { speak } from "@/components/SpeakButton";
import { LANG_INFO } from "@/lib/languages";
import { fold, keyPart } from "@/lib/practice";
import { supportName } from "@/lib/prefs";
import { fullWord, todayLocal } from "@/lib/schedule";
import { api, supabase } from "@/lib/supabase";
import type { Word } from "@/lib/types";

type Question = { question: string; options: string[]; answer: number; explanation: string };
type Story = {
  id: string;
  word_ids: string[];
  score: number | null;
  content: { title: string; text: string; translation: string; used: string[]; questions: Question[] };
};
type StoryWord = Pick<Word, "id" | "word" | "article" | "kind" | "key_word" | "meaning_en">;

/** Generic placeholders in expressions; never highlighted. */
const SKIP = new Set(["iemand", "iets", "zich", "jemand", "jemandem", "jemanden", "etwas", "sich", "someone", "something", "oneself"]);

/**
 * What to look for in the story, per word: the start of each meaningful part, so inflected forms match
 * ("Termin" in "Termine", "drücken" in "gedrückt") without catching other words ("Fahrrad" doesn't match "fahren").
 */
function stems(words: StoryWord[]): { stem: string; word: StoryWord }[] {
  const out: { stem: string; word: StoryWord }[] = [];
  for (const w of words) {
    const base = w.kind !== "word" ? keyPart(w.word, w.key_word) || w.word : w.word;
    for (const part of fold(base).split(" ")) {
      if (part.length < 3 || SKIP.has(part)) continue;
      out.push({ stem: part.length <= 4 ? part : part.slice(0, Math.max(4, part.length - 2)), word: w });
    }
  }
  return out;
}

/** Today's story (made once per day by the server) and the learner's words in it. */
async function fetchStory(today: string): Promise<{ story: Story; words: StoryWord[] }> {
  const { story } = await api<{ story: Story }>("/api/story", { today }, 60_000);
  const { data } = await supabase()
    .from("words")
    .select("id, word, article, kind, key_word, meaning_en")
    .in("id", story.word_ids ?? []);
  return { story, words: (data ?? []) as StoryWord[] };
}

export default function StoryPage() {
  const prefs = usePrefs();
  const lang = prefs.language;
  const info = LANG_INFO[lang];
  const [today] = useState(todayLocal);
  const [story, setStory] = useState<Story | null>(null);
  const [words, setWords] = useState<StoryWord[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [showTranslation, setShowTranslation] = useState(false);
  const [picked, setPicked] = useState<(number | null)[]>([]);
  const [checked, setChecked] = useState(false);
  const [openWord, setOpenWord] = useState<string | null>(null);

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    fetchStory(today)
      .then(({ story: st, words: ws }) => {
        if (!alive) return;
        setStory(st);
        setWords(ws);
        setPicked(st.content.questions.map(() => null));
        setChecked(st.score !== null);
      })
      .catch((err) => alive && setError(err))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [today, attempt]);

  function retry() {
    setLoading(true);
    setError(null);
    setAttempt((a) => a + 1);
  }

  const marks = useMemo(() => stems(words), [words]);

  async function check() {
    if (!story) return;
    const right = story.content.questions.filter((q, i) => picked[i] === q.answer).length;
    setChecked(true);
    setStory({ ...story, score: right });
    await supabase().from("stories").update({ score: right }).eq("id", story.id);
  }

  const wordFor = (token: string) => {
    const f = fold(token);
    // Starts with the stem; or, for past forms, after "ge-" ("gedrückt", "gemaakt").
    return marks.find((m) => f.startsWith(m.stem) || (f.startsWith("ge") && f.slice(2).startsWith(m.stem)))?.word ?? null;
  };

  return (
    <>
      <PageHeader title="Today's story" />
      <main className="flex flex-col gap-4 px-5 pb-6 pt-2">
        {loading && (
          <div className="panel flex flex-col gap-3 p-5" aria-busy="true" aria-label="Writing today's story">
            <p className="text-sm text-soft">Writing a story with your words…</p>
            {[90, 75, 85, 60].map((w, i) => <div key={i} className="h-4 animate-pulse rounded bg-hairline" style={{ width: `${w}%` }} />)}
          </div>
        )}
        {error ? (
          <>
            <ErrorBox error={error} onRetry={retry} />
            <Link href="/add" className="btn-secondary">Add words</Link>
          </>
        ) : null}

        {story && !loading && (
          <>
            <article className="panel flex flex-col gap-3 p-5">
              <div className="flex items-start justify-between gap-3">
                <h1 lang={lang} className="font-display text-2xl font-bold leading-tight">{story.content.title}</h1>
                <button type="button" aria-label="Read the story aloud"
                  onClick={() => speak(`${story.content.title}. ${story.content.text}`, info.speech, prefs.speech === "slow" ? 0.75 : 0.95)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-white">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M11 5 6 9H2v6h4l5 4V5z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" />
                  </svg>
                </button>
              </div>
              <p className="text-xs text-muted">Your words are highlighted — tap one to see what it means.</p>
              <div lang={lang} className="flex flex-col gap-3 text-[17px] leading-relaxed">
                {story.content.text.split(/\n\s*\n/).map((para, p) => (
                  <p key={p}>
                    {para.split(/(\s+)/).map((tok, i) => {
                      const w = tok.trim() ? wordFor(tok) : null;
                      if (!w) return <span key={i}>{tok}</span>;
                      // Keep punctuation outside the highlight: "Termin." -> [Termin] + "."
                      const [, lead, core, trail] = tok.match(/^([^\p{L}]*)(.*?)([^\p{L}]*)$/u) ?? ["", "", tok, ""];
                      return (
                        <span key={i}>{lead}<button type="button" onClick={() => setOpenWord(openWord === `${p}-${i}` ? null : `${p}-${i}`)}
                          className="relative rounded bg-accent-soft px-0.5 font-semibold text-ink">
                          {core}
                          {openWord === `${p}-${i}` && (
                            <span role="tooltip"
                              className="absolute left-0 top-full z-10 mt-1 w-max max-w-56 rounded-lg bg-ink px-2.5 py-1.5 text-left text-xs font-medium text-white shadow-lg">
                              {fullWord(w)} — {w.meaning_en.split(";")[0]}
                            </span>
                          )}
                        </button>{trail}</span>
                      );
                    })}
                  </p>
                ))}
              </div>
              <button type="button" className="btn-small self-start" aria-pressed={showTranslation}
                onClick={() => setShowTranslation(!showTranslation)}>
                {showTranslation ? "Hide" : "Show"} {supportName(prefs)}
              </button>
              {showTranslation && (
                <div className="flex flex-col gap-2 border-t border-hairline pt-3 text-[15px] leading-relaxed text-soft">
                  {story.content.translation.split(/\n\s*\n/).map((para, i) => <p key={i}>{para}</p>)}
                </div>
              )}
            </article>

            <section aria-labelledby="questions-title" className="panel flex flex-col gap-4 p-5">
              <h2 id="questions-title" className="font-display text-lg font-bold">
                Did you understand it?
                {checked && story.score !== null && (
                  <span className="ml-2 text-base font-semibold text-soft">{story.score}/{story.content.questions.length}</span>
                )}
              </h2>
              {story.content.questions.map((q, qi) => (
                <fieldset key={qi} className="flex flex-col gap-2">
                  <legend lang={lang} className="mb-1 text-[15px] font-semibold">{qi + 1}. {q.question}</legend>
                  {q.options.map((opt, oi) => {
                    const chosen = picked[qi] === oi;
                    const state = !checked ? (chosen ? "border-accent bg-accent-soft" : "border-line bg-white")
                      : oi === q.answer ? "border-transparent bg-good-soft text-good-ink"
                        : chosen ? "border-transparent bg-due-soft text-due-ink" : "border-line bg-white opacity-70";
                    return (
                      <label key={oi} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5 ${state}`}>
                        <input type="radio" name={`q${qi}`} checked={chosen} disabled={checked} className="sr-only"
                          onChange={() => setPicked((p) => p.map((v, i) => (i === qi ? oi : v)))} />
                        <span lang={lang} className="text-[15px]">{opt}</span>
                      </label>
                    );
                  })}
                  {checked && <p className="text-sm text-soft">{q.explanation}</p>}
                </fieldset>
              ))}
              {!checked ? (
                <button type="button" className="btn-primary" disabled={picked.some((p) => p === null)} onClick={check}>
                  Check answers
                </button>
              ) : (
                <p role="status" className="text-sm text-soft">A new story with your latest words comes tomorrow.</p>
              )}
            </section>
            <Link href="/review" className="btn-secondary">Go to today&apos;s review</Link>
          </>
        )}
      </main>
    </>
  );
}
