"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePrefs } from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import SpeakButton, { speak } from "@/components/SpeakButton";
import WordCardView from "@/components/WordCardView";
import { MAX_REVIEWS_PER_DAY } from "@/lib/config";
import { LANG_INFO } from "@/lib/languages";
import { canRecognizeSpeech, canSpeak, listenOnce, SpeechError } from "@/lib/listen";
import { blankOut, cachedTask, closeEnough, expressionGap, keyPart } from "@/lib/practice";
import { supportLabel } from "@/lib/prefs";
import {
  AUDIO_FALLBACK,
  daysBetween,
  fullWord,
  needsAiTask,
  nextState,
  normalize,
  stableShuffle,
  taskFor,
  todayLocal,
  type Rating,
} from "@/lib/schedule";
import { api, supabase } from "@/lib/supabase";
import type { AiTask, SentenceCheck, TaskType, Word } from "@/lib/types";

type Item = { word: Word; task: TaskType; ai: AiTask | null };
type Feedback = { correct: boolean; title: string; detail?: string };
type Phase = "loading" | "empty" | "question" | "feedback" | "done" | "error";

const TASK_NAMES: Record<TaskType, string> = {
  meaning: "What does it mean?",
  type: "Type the word",
  recall: "From the translation",
  listen: "Listen and type",
  say: "Say it",
  gap: "Fill the gap",
  choose: "Choose the right word",
  write: "Write your own sentence",
  complete: "Complete the expression",
};

const RATING_LABEL: Record<Rating, string> = { again: "Again", hard: "Hard", good: "Good", easy: "Easy" };

function inDays(days: number): string {
  return days <= 1 ? "tomorrow" : days < 60 ? `${days} days` : `${Math.round(days / 30)} months`;
}

export default function ReviewPage() {
  const [today] = useState(todayLocal);
  const prefs = usePrefs();
  const lang = prefs.language;
  const info = LANG_INFO[lang];
  const t = info.labels;
  const rate = prefs.speech === "slow" ? 0.7 : 0.95;
  const [phase, setPhase] = useState<Phase>("loading");
  const [items, setItems] = useState<Item[]>([]);
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState({ right: 0, wrong: 0 });
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [answer, setAnswer] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showCard, setShowCard] = useState(false);
  const [saving, setSaving] = useState(false);
  const [heard, setHeard] = useState<{ listening: boolean; text: string | null; tries: number; error: string | null }>(
    { listening: false, text: null, tries: 0, error: null },
  );

  useEffect(() => {
    let alive = true;
    async function load() {
      const { data, error } = await supabase()
        .from("words")
        .select("*")
        .eq("language", lang)
        .lte("due_on", today)
        .order("due_on")
        .order("added_on")
        .limit(MAX_REVIEWS_PER_DAY);
      if (!alive) return;
      if (error) {
        setMessage(error.message);
        setPhase("error");
        return;
      }
      const words = (data ?? []) as Word[];
      if (words.length === 0) {
        setPhase("empty");
        return;
      }
      const speakOk = canSpeak();
      const micOk = canRecognizeSpeech();
      let list: Item[] = words.map((w) => {
        let task = taskFor(w, today);
        // No voice or microphone in this browser: use the typing version instead.
        if ((task === "listen" && !speakOk) || (task === "say" && !micOk)) task = AUDIO_FALLBACK[task]!;
        if ((task === "type" || task === "recall") && w.kind !== "word") task = "complete";
        if (task === "complete") {
          // Hide the key part of the expression itself; no AI needed.
          const b = blankOut(w.word, keyPart(w.word, w.key_word));
          return b
            ? { word: w, task, ai: { ...b, en: w.meaning_en, distractors: [] } }
            : { word: w, task: "meaning" as TaskType, ai: null };
        }
        return { word: w, task, ai: cachedTask(w, today) };
      });

      // One AI call makes today's fresh sentences for every gap / choice exercise.
      const missing = list.filter((it) => needsAiTask(it.task) && !it.ai).map((it) => it.word.id);
      if (missing.length > 0) {
        try {
          const { tasks } = await api<{ tasks: Record<string, AiTask> }>("/api/tasks", { ids: missing, today });
          list = list.map((it) => ({ ...it, ai: it.ai ?? tasks[it.word.id] ?? null }));
        } catch (err) {
          setMessage(`${(err as Error).message} Using other exercises instead.`);
        }
      }
      // Without an AI sentence, fall back: words to typing, expressions to a gap from their own examples.
      list = list.map((it): Item => {
        if (!needsAiTask(it.task) || (it.ai && (it.task !== "choose" || it.ai.distractors.length > 0))) return it;
        if (it.word.kind !== "word") {
          const gap = expressionGap(it.word);
          return gap ? { ...it, task: "gap", ai: gap } : { ...it, task: "meaning", ai: null };
        }
        return { ...it, task: "recall" };
      });
      if (!alive) return;
      setItems(list);
      setPhase("question");
    }
    load();
    return () => {
      alive = false;
    };
  }, [today, lang]);

  const item = items[index];

  /** Saves the answer: moves the word in the schedule and logs the review. */
  async function record(rating: Rating) {
    const w = item.word;
    const next = nextState(w.stage, rating, today);
    setSaving(true);
    const db = supabase();
    const [upd, ins] = await Promise.all([
      db.from("words").update({
        ...next,
        last_reviewed_on: today,
        ...(rating === "again" ? { lapses: (w.lapses ?? 0) + 1 } : {}),
      }).eq("id", w.id),
      db.from("reviews").insert({ word_id: w.id, stage: w.stage, task: item.task, correct: rating !== "again", rating }),
    ]);
    setSaving(false);
    if (upd.error || ins.error) setMessage("Your answer could not be saved. Check your connection.");
  }

  /** Shows whether the answer was right. Wrong answers count as "Again" straight away. */
  function answered(correct: boolean, title: string, detail?: string) {
    setFeedback({ correct, title, detail });
    setShowCard(!correct);
    setPhase("feedback");
    setScore((s) => (correct ? { ...s, right: s.right + 1 } : { ...s, wrong: s.wrong + 1 }));
    if (!correct) void record("again");
  }

  /** You rated a right answer (or a meaning card): save it and go on. */
  async function rateAndNext(rating: Rating) {
    if (item.task === "meaning" && !feedback) {
      setScore((s) => (rating === "again" ? { ...s, wrong: s.wrong + 1 } : { ...s, right: s.right + 1 }));
    }
    await record(rating);
    if (rating === "again" && item.task === "meaning") {
      setFeedback({ correct: false, title: `${fullWord(item.word)}: ${item.word.meaning_en}` });
      setShowCard(true);
      setPhase("feedback");
      return;
    }
    next();
  }

  function next() {
    setAnswer("");
    setRevealed(false);
    setFeedback(null);
    setHeard({ listening: false, text: null, tries: 0, error: null });
    if (index + 1 >= items.length) setPhase("done");
    else {
      setIndex(index + 1);
      setPhase("question");
    }
  }

  /** Swap a listening or speaking exercise for its typing version (no penalty). */
  function switchToTyping() {
    const fallback = AUDIO_FALLBACK[item.task];
    if (!fallback) return;
    const w = item.word;
    // Expressions don't get "type it with the article": they get "complete the expression".
    const b = w.kind !== "word" ? blankOut(w.word, keyPart(w.word, w.key_word)) : null;
    const swap: Item = b
      ? { ...item, task: "complete", ai: { ...b, en: w.meaning_en, distractors: [] } }
      : w.kind !== "word" ? { ...item, task: "meaning", ai: null } : { ...item, task: fallback };
    setItems((list) => list.map((it, i) => (i === index ? swap : it)));
    setHeard({ listening: false, text: null, tries: 0, error: null });
    setAnswer("");
  }

  function checkTyped(e: React.FormEvent) {
    e.preventDefault();
    if (!answer.trim()) return;
    const w = item.word;
    const given = normalize(answer);
    const target = fullWord(w);
    if (item.task === "type" || item.task === "recall" || item.task === "listen") {
      if (given === normalize(target)) return answered(true, `${t.good} ${target}`);
      if (w.article && given === normalize(w.word)) {
        return answered(false, `Almost! It's ${target}`, `Remember the article: ${w.article}.`);
      }
      if (closeEnough(answer, target)) return answered(true, `${t.good} Check the spelling: ${target}`);
      return answered(false, `The answer: ${target}`, item.task === "listen" ? `You heard “${target}”.` : undefined);
    }
    // gap or complete
    const ok = [item.ai?.answer ?? "", w.word].some((a) => a && given === normalize(a));
    if (ok) return answered(true, `${t.good} ${item.ai?.answer ?? w.word}`, item.ai?.en);
    if (closeEnough(answer, item.ai?.answer ?? w.word)) {
      return answered(true, `${t.good} Check the spelling: ${item.ai?.answer ?? w.word}`, item.ai?.en);
    }
    return answered(false, `The answer: ${item.ai?.answer ?? w.word}`, item.ai?.en);
  }

  async function sayIt() {
    const w = item.word;
    setHeard((h) => ({ ...h, listening: true, error: null }));
    try {
      const options = await listenOnce(info.speech);
      const ok = options.some((o) => closeEnough(o, fullWord(w)) || closeEnough(o, w.word));
      const tries = heard.tries + 1;
      setHeard({ listening: false, text: options[0] ?? "", tries, error: null });
      if (ok) answered(true, `${t.good} ${fullWord(w)}`, options[0] ? `I heard “${options[0]}”.` : undefined);
      else if (tries >= 3) answered(false, `The answer: ${fullWord(w)}`, options[0] ? `I heard “${options[0]}”.` : undefined);
    } catch (err) {
      setHeard((h) => ({ ...h, listening: false, error: err instanceof SpeechError ? err.message : "Speech recognition failed." }));
    }
  }

  async function checkSentence(e: React.FormEvent) {
    e.preventDefault();
    if (!answer.trim()) return;
    setChecking(true);
    try {
      const { check } = await api<{ check: SentenceCheck }>("/api/check-sentence", {
        wordId: item.word.id,
        sentence: answer,
      });
      const detail = [check.feedback_nl, check.corrected !== answer.trim() ? `Correct: ${check.corrected}` : ""]
        .filter(Boolean)
        .join("\n");
      answered(check.correct, check.correct ? t.wellDone : "Not quite", detail);
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setChecking(false);
    }
  }

  if (phase === "loading") {
    return (
      <>
        <PageHeader title="Today's review" />
        <p className="px-5 pt-6 text-soft" aria-busy="true">Preparing today&apos;s review…</p>
      </>
    );
  }

  if (phase === "empty" || phase === "error" || phase === "done") {
    return (
      <>
        <PageHeader title="Today's review" />
        <main className="flex flex-col gap-4 px-5 pt-6">
          {phase === "done" && (
            <>
              <h1 className="font-display text-[28px] font-bold">{t.doneToday}</h1>
              <p className="text-soft">
                {score.right} right, {score.wrong} to practise again. Words you missed come back tomorrow.
              </p>
            </>
          )}
          {phase === "empty" && (
            <>
              <h1 className="font-display text-[28px] font-bold">Nothing to review</h1>
              <p className="text-soft">No words are due today. Read today&apos;s story, or add new words you meet.</p>
            </>
          )}
          {phase === "error" && <p role="alert" className="text-due-ink">{message}</p>}
          <Link href="/story" className="btn-primary">Read today&apos;s story</Link>
          <Link href="/progress" className="btn-secondary">See my progress</Link>
        </main>
      </>
    );
  }

  const w = item.word;
  const options =
    item.task === "choose" && item.ai
      ? stableShuffle([item.ai.answer, ...item.ai.distractors], w.id + today)
      : [];
  const [before, after] = (item.ai?.sentence ?? "").split("___");
  const typed = ["type", "recall", "listen", "gap", "complete"].includes(item.task);
  const ratings: Rating[] = item.task === "meaning" && !feedback ? ["again", "hard", "good", "easy"] : ["hard", "good", "easy"];

  return (
    <>
      <header className="flex flex-col gap-2.5 px-5 pb-2 pt-[calc(20px+env(safe-area-inset-top))]">
        <div className="flex items-center justify-between">
          <span className="font-display text-lg font-bold">Today&apos;s review</span>
          <span className="text-sm font-semibold text-soft">{index + 1} of {items.length}</span>
        </div>
        <div role="progressbar" aria-label="Review progress" aria-valuemin={0} aria-valuemax={items.length}
          aria-valuenow={index} className="h-2 overflow-hidden rounded-full bg-[#e3e5ea]">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(index / items.length) * 100}%` }} />
        </div>
      </header>

      <main className="flex flex-col gap-4 px-5 pb-6 pt-3">
        <span className="self-start rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent-dark">
          {w.stage >= 7 ? "Check-up" : `Review ${w.stage} of 6`} · {TASK_NAMES[item.task]}
        </span>
        {message && <p role="status" className="rounded-xl bg-due-soft px-4 py-3 text-sm text-due-ink">{message}</p>}

        {/* Question */}
        <section aria-label="Question" className="panel flex flex-col gap-4 px-5 py-6">
          {item.task === "meaning" && (
            <div className="flex items-center justify-between gap-3">
              <span lang={lang} className="font-display text-3xl font-bold">{fullWord(w)}</span>
              <SpeakButton text={fullWord(w)} />
            </div>
          )}
          {(item.task === "type" || item.task === "write") && (
            <>
              {item.task === "write" && (
                <p className="text-[15px] text-soft">
                  Use <strong lang={lang} className="text-ink">{fullWord(w)}</strong> in your own {info.name} sentence.
                </p>
              )}
              <p lang={lang} className="font-display text-xl font-medium leading-snug">{w.meaning_nl}</p>
              {item.task === "type" && <Hint key={w.id} text={w.meaning_en} label={`Show ${supportLabel(w.translation_lang)}`} />}
            </>
          )}
          {(item.task === "recall" || item.task === "say") && (
            <>
              <span className="label">{supportLabel(w.translation_lang)}</span>
              <p className="font-display text-2xl font-semibold leading-snug">{w.meaning_en}</p>
              <Hint key={w.id} text={w.meaning_nl} label={`Hint in ${info.name}`} lang={lang} />
            </>
          )}
          {item.task === "listen" && (
            <div className="flex flex-col items-center gap-3 py-2">
              <button type="button" onClick={() => speak(fullWord(w), info.speech, rate)}
                aria-label="Play the word"
                className="flex h-20 w-20 items-center justify-center rounded-full bg-accent text-white shadow-md">
                <svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
              </button>
              <div className="flex gap-2">
                <button type="button" className="btn-small" onClick={() => speak(fullWord(w), info.speech, 0.6)}>Play slowly</button>
              </div>
              <p className="text-sm text-soft">Tap play, then type what you hear{w.article ? ", with the article" : ""}.</p>
            </div>
          )}
          {(item.task === "gap" || item.task === "choose" || item.task === "complete") && item.ai && (
            <>
              <p lang={lang} className="font-display text-[22px] font-medium leading-normal">
                {before}
                <span className="inline-block min-w-24 border-b-2 border-ink align-baseline">
                  {phase === "feedback" ? item.ai.answer : " "}
                </span>
                {after}
              </p>
              <div className="flex flex-col gap-1 border-t border-hairline pt-3.5">
                <span className="label">Hint</span>
                <p lang={lang} className="text-[15px] leading-snug text-[#2c303a]">{w.meaning_nl}</p>
              </div>
            </>
          )}
        </section>

        {/* Answer */}
        {phase === "question" && item.task === "meaning" && (
          revealed ? (
            <div className="flex flex-col gap-3">
              <div className="panel flex flex-col gap-1 p-4">
                <p lang={lang} className="text-base">{w.meaning_nl}</p>
                <p className="text-[15px] text-soft">{w.meaning_en}</p>
              </div>
              <RatingButtons stage={w.stage} today={today} ratings={ratings} disabled={saving} onRate={rateAndNext}
                question="How well did you know it?" />
            </div>
          ) : (
            <button type="button" className="btn-primary" onClick={() => setRevealed(true)}>Show meaning</button>
          )
        )}

        {phase === "question" && typed && (
          <form onSubmit={checkTyped} className="flex flex-col gap-3">
            <label htmlFor="answer" className="text-[13px] font-semibold text-soft">
              {(item.task === "type" || item.task === "recall" || item.task === "listen") && w.article
                ? `Your answer (with ${info.articles.join(", ")})`
                : "Your answer"}
            </label>
            <input id="answer" key={`${w.id}-${item.task}`} lang={lang} autoFocus autoComplete="off" autoCapitalize="none"
              spellCheck={false} value={answer} onChange={(e) => setAnswer(e.target.value)}
              className="field h-[52px] text-lg font-medium" />
            <button type="submit" className="btn-primary" disabled={!answer.trim()}>Check</button>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary flex-1"
                onClick={() => answered(false, `The answer: ${["gap", "complete"].includes(item.task) ? item.ai?.answer : fullWord(w)}`, item.task === "gap" ? item.ai?.en : undefined)}>
                I don&apos;t know
              </button>
              {item.task === "listen" && (
                <button type="button" className="btn-secondary flex-1" onClick={switchToTyping}>Can&apos;t listen now</button>
              )}
            </div>
          </form>
        )}

        {phase === "question" && item.task === "say" && (
          <div className="flex flex-col items-center gap-3">
            <button type="button" onClick={sayIt} disabled={heard.listening}
              aria-label={heard.listening ? "Listening" : "Tap and say the word"}
              className={`flex h-20 w-20 items-center justify-center rounded-full text-white shadow-md ${heard.listening ? "animate-pulse bg-[#b42318]" : "bg-accent"}`}>
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
              </svg>
            </button>
            <p role="status" className="min-h-6 text-center text-sm text-soft">
              {heard.listening
                ? "Listening… say the word now."
                : heard.error
                  ? heard.error
                  : heard.text !== null
                    ? `I heard “${heard.text || "nothing"}”. Try again (${3 - heard.tries} left).`
                    : `Tap the microphone and say it in ${info.name}${w.article ? ", with the article" : ""}.`}
            </p>
            <div className="flex w-full gap-2">
              <button type="button" className="btn-secondary flex-1"
                onClick={() => answered(false, `The answer: ${fullWord(w)}`)}>I don&apos;t know</button>
              <button type="button" className="btn-secondary flex-1" onClick={switchToTyping}>Can&apos;t speak now</button>
            </div>
          </div>
        )}

        {phase === "question" && item.task === "choose" && (
          <div role="group" aria-label="Options" className="flex flex-col gap-2.5">
            {options.map((opt) => (
              <button key={opt} type="button" lang={lang} className="btn-secondary h-[52px] text-[17px]"
                onClick={() =>
                  opt === item.ai?.answer
                    ? answered(true, `${t.good} ${opt}`, item.ai?.en)
                    : answered(false, `The answer: ${item.ai?.answer}`, item.ai?.en)
                }>
                {opt}
              </button>
            ))}
          </div>
        )}

        {phase === "question" && item.task === "write" && (
          <form onSubmit={checkSentence} className="flex flex-col gap-3">
            <label htmlFor="sentence" className="text-[13px] font-semibold text-soft">Your sentence</label>
            <textarea id="sentence" lang={lang} rows={3} value={answer} onChange={(e) => setAnswer(e.target.value)}
              className="field resize-none text-[17px]" />
            <button type="submit" className="btn-primary" disabled={!answer.trim() || checking}>
              {checking ? "Checking…" : "Check"}
            </button>
            <button type="button" className="btn-secondary" disabled={checking}
              onClick={() => answered(false, "No problem — study the card", undefined)}>
              I don&apos;t know
            </button>
          </form>
        )}

        {/* Feedback */}
        {phase === "feedback" && feedback && (
          <div className="flex flex-col gap-3">
            <div role="status"
              className={`flex flex-col gap-1 rounded-2xl px-4 py-3.5 ${feedback.correct ? "bg-good-soft text-good-ink" : "bg-due-soft text-due-ink"}`}>
              <span lang={lang} className="text-base font-semibold">{feedback.title}</span>
              {feedback.detail && <span className="whitespace-pre-line text-sm">{feedback.detail}</span>}
              {!feedback.correct && (
                <span className="text-sm">It comes back tomorrow, two reviews back — not from the start.</span>
              )}
            </div>
            {showCard ? (
              <WordCardView card={w} note={w.note} drawing={w.drawing} language={w.language} translation={w.translation_lang} />
            ) : (
              <button type="button" className="btn-small self-start" onClick={() => setShowCard(true)}>Show card</button>
            )}
            {feedback.correct ? (
              <RatingButtons stage={w.stage} today={today} ratings={ratings} disabled={saving} onRate={rateAndNext}
                question="How easy was it?" />
            ) : (
              <button type="button" className="btn-primary" onClick={next} disabled={saving}>
                {index + 1 >= items.length ? "Finish" : "Next word"}
              </button>
            )}
          </div>
        )}
      </main>
    </>
  );
}

/** Again / Hard / Good / Easy, each showing when the word comes back. */
function RatingButtons({ stage, today, ratings, onRate, disabled, question }: {
  stage: number;
  today: string;
  ratings: Rating[];
  onRate: (r: Rating) => void;
  disabled: boolean;
  question: string;
}) {
  const style: Record<Rating, string> = {
    again: "border-[#f3c9a8] bg-due-soft text-due-ink",
    hard: "border-line bg-white text-ink",
    good: "border-accent bg-accent text-white",
    easy: "border-[#b7dfc3] bg-good-soft text-good-ink",
  };
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13px] font-semibold text-soft">{question}</span>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${ratings.length}, minmax(0, 1fr))` }}>
        {ratings.map((r) => {
          const days = daysBetween(today, nextState(stage, r, today).due_on);
          return (
            <button key={r} type="button" disabled={disabled} onClick={() => onRate(r)}
              className={`flex h-16 flex-col items-center justify-center rounded-xl border text-[15px] font-semibold disabled:opacity-60 ${style[r]}`}>
              {RATING_LABEL[r]}
              <span className="text-xs font-medium opacity-80">{inDays(days)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Hint({ text, label, lang }: { text: string; label: string; lang?: string }) {
  const [open, setOpen] = useState(false);
  return open ? (
    <p lang={lang} className="text-[15px] text-soft">{text}</p>
  ) : (
    <button type="button" className="btn-small self-start" onClick={() => setOpen(true)}>{label}</button>
  );
}
