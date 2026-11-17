"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import SpeakButton from "@/components/SpeakButton";
import WordCardView from "@/components/WordCardView";
import { MAX_REVIEWS_PER_DAY } from "@/lib/config";
import {
  fullWord,
  needsAiTask,
  nextState,
  normalize,
  stableShuffle,
  taskFor,
  todayLocal,
} from "@/lib/schedule";
import { api, supabase } from "@/lib/supabase";
import type { AiTask, SentenceCheck, TaskType, Word } from "@/lib/types";

type Item = { word: Word; task: TaskType; ai: AiTask | null };
type Feedback = { correct: boolean; title: string; detail?: string };
type Phase = "loading" | "empty" | "question" | "feedback" | "done" | "error";

const TASK_NAMES: Record<TaskType, string> = {
  meaning: "What does it mean?",
  type: "Type the word",
  gap: "Fill the gap",
  choose: "Choose the right word",
  write: "Write your own sentence",
};

export default function ReviewPage() {
  const [today] = useState(todayLocal);
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

  useEffect(() => {
    let alive = true;
    async function load() {
      const { data, error } = await supabase()
        .from("words")
        .select("*")
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
      let list: Item[] = words.map((w) => ({
        word: w,
        task: taskFor(w, today),
        ai: w.review_task_on === today ? w.review_task : null,
      }));

      // One AI call makes today's fresh sentences for every gap / choice exercise.
      const missing = list.filter((it) => needsAiTask(it.task) && !it.ai).map((it) => it.word.id);
      if (missing.length > 0) {
        try {
          const { tasks } = await api<{ tasks: Record<string, AiTask> }>("/api/tasks", { ids: missing, today });
          list = list.map((it) => ({ ...it, ai: it.ai ?? tasks[it.word.id] ?? null }));
        } catch (err) {
          setMessage(`${(err as Error).message} Using typing exercises instead.`);
        }
      }
      // Without a sentence, fall back to typing the word.
      list = list.map((it) =>
        needsAiTask(it.task) && (!it.ai || (it.task === "choose" && it.ai.distractors.length === 0))
          ? { ...it, task: "type" }
          : it,
      );
      if (!alive) return;
      setItems(list);
      setPhase("question");
    }
    load();
    return () => {
      alive = false;
    };
  }, [today]);

  const item = items[index];

  async function grade(correct: boolean, title: string, detail?: string) {
    setFeedback({ correct, title, detail });
    setShowCard(!correct);
    setPhase("feedback");
    setScore((s) => (correct ? { ...s, right: s.right + 1 } : { ...s, wrong: s.wrong + 1 }));
    const db = supabase();
    const next = nextState(item.word.stage, correct, today);
    const [upd, ins] = await Promise.all([
      db.from("words").update(next).eq("id", item.word.id),
      db.from("reviews").insert({ word_id: item.word.id, stage: item.word.stage, task: item.task, correct }),
    ]);
    if (upd.error || ins.error) setMessage("Your answer could not be saved. Check your connection.");
  }

  function next() {
    setAnswer("");
    setRevealed(false);
    setFeedback(null);
    if (index + 1 >= items.length) setPhase("done");
    else {
      setIndex(index + 1);
      setPhase("question");
    }
  }

  function checkTyped(e: React.FormEvent) {
    e.preventDefault();
    if (!answer.trim()) return;
    const w = item.word;
    const given = normalize(answer);
    const target = fullWord(w);
    if (item.task === "type") {
      if (given === normalize(target)) return grade(true, `Goed! ${target}`);
      if (w.article && given === normalize(w.word)) {
        return grade(false, `Bijna! It's ${target}`, `Remember the article: ${w.article}.`);
      }
      return grade(false, `The answer: ${target}`);
    }
    // gap
    const ok = [item.ai?.answer ?? "", w.word].some((a) => a && given === normalize(a));
    return ok
      ? grade(true, `Goed! ${item.ai?.answer ?? w.word}`, item.ai?.en)
      : grade(false, `The answer: ${item.ai?.answer ?? w.word}`, item.ai?.en);
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
      await grade(check.correct, check.correct ? "Goed gedaan!" : "Not quite", detail);
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
              <h1 className="font-display text-[28px] font-bold">Klaar voor vandaag!</h1>
              <p className="text-soft">
                {score.right} right, {score.wrong} to practise again. Words you missed come back tomorrow.
              </p>
            </>
          )}
          {phase === "empty" && (
            <>
              <h1 className="font-display text-[28px] font-bold">Nothing to review</h1>
              <p className="text-soft">No words are due today. Add new words you meet, and they come back tomorrow.</p>
            </>
          )}
          {phase === "error" && <p role="alert" className="text-due-ink">{message}</p>}
          <Link href="/add" className="btn-primary">Add a word</Link>
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
              <span lang="nl" className="font-display text-3xl font-bold">{fullWord(w)}</span>
              <SpeakButton text={fullWord(w)} />
            </div>
          )}
          {(item.task === "type" || item.task === "write") && (
            <>
              {item.task === "write" && (
                <p className="text-[15px] text-soft">
                  Use <strong lang="nl" className="text-ink">{fullWord(w)}</strong> in your own Dutch sentence.
                </p>
              )}
              <p lang="nl" className="font-display text-xl font-medium leading-snug">{w.meaning_nl}</p>
              {item.task === "type" && <Hint key={w.id} text={w.meaning_en} label="Show English" />}
            </>
          )}
          {(item.task === "gap" || item.task === "choose") && item.ai && (
            <>
              <p lang="nl" className="font-display text-[22px] font-medium leading-normal">
                {before}
                <span className="inline-block min-w-24 border-b-2 border-ink align-baseline">
                  {phase === "feedback" ? item.ai.answer : " "}
                </span>
                {after}
              </p>
              <div className="flex flex-col gap-1 border-t border-hairline pt-3.5">
                <span className="label">Hint</span>
                <p lang="nl" className="text-[15px] leading-snug text-[#2c303a]">{w.meaning_nl}</p>
              </div>
            </>
          )}
        </section>

        {/* Answer */}
        {phase === "question" && item.task === "meaning" && (
          revealed ? (
            <div className="flex flex-col gap-3">
              <div className="panel flex flex-col gap-1 p-4">
                <p lang="nl" className="text-base">{w.meaning_nl}</p>
                <p className="text-[15px] text-soft">{w.meaning_en}</p>
              </div>
              <button type="button" className="btn-primary" onClick={() => grade(true, "Goed!")}>I knew it</button>
              <button type="button" className="btn-secondary" onClick={() => grade(false, `${fullWord(w)}: ${w.meaning_en}`)}>
                I didn&apos;t know it
              </button>
            </div>
          ) : (
            <button type="button" className="btn-primary" onClick={() => setRevealed(true)}>Show meaning</button>
          )
        )}

        {phase === "question" && (item.task === "type" || item.task === "gap") && (
          <form onSubmit={checkTyped} className="flex flex-col gap-3">
            <label htmlFor="answer" className="text-[13px] font-semibold text-soft">
              {item.task === "type" && w.article ? "Your answer (with de or het)" : "Your answer"}
            </label>
            <input id="answer" lang="nl" autoFocus autoComplete="off" autoCapitalize="none" spellCheck={false}
              value={answer} onChange={(e) => setAnswer(e.target.value)}
              className="field h-[52px] text-lg font-medium" />
            <button type="submit" className="btn-primary" disabled={!answer.trim()}>Check</button>
            <button type="button" className="btn-secondary"
              onClick={() => grade(false, `The answer: ${item.task === "gap" ? item.ai?.answer : fullWord(w)}`, item.task === "gap" ? item.ai?.en : undefined)}>
              I don&apos;t know
            </button>
          </form>
        )}

        {phase === "question" && item.task === "choose" && (
          <div role="group" aria-label="Options" className="flex flex-col gap-2.5">
            {options.map((opt) => (
              <button key={opt} type="button" lang="nl" className="btn-secondary h-[52px] text-[17px]"
                onClick={() =>
                  opt === item.ai?.answer
                    ? grade(true, `Goed! ${opt}`, item.ai?.en)
                    : grade(false, `The answer: ${item.ai?.answer}`, item.ai?.en)
                }>
                {opt}
              </button>
            ))}
          </div>
        )}

        {phase === "question" && item.task === "write" && (
          <form onSubmit={checkSentence} className="flex flex-col gap-3">
            <label htmlFor="sentence" className="text-[13px] font-semibold text-soft">Your sentence</label>
            <textarea id="sentence" lang="nl" rows={3} value={answer} onChange={(e) => setAnswer(e.target.value)}
              className="field resize-none text-[17px]" />
            <button type="submit" className="btn-primary" disabled={!answer.trim() || checking}>
              {checking ? "Checking…" : "Check"}
            </button>
            <button type="button" className="btn-secondary" disabled={checking}
              onClick={() => grade(false, "No problem — study the card", undefined)}>
              I don&apos;t know
            </button>
          </form>
        )}

        {/* Feedback */}
        {phase === "feedback" && feedback && (
          <div className="flex flex-col gap-3">
            <div role="status"
              className={`flex flex-col gap-1 rounded-2xl px-4 py-3.5 ${feedback.correct ? "bg-good-soft text-good-ink" : "bg-due-soft text-due-ink"}`}>
              <span lang="nl" className="text-base font-semibold">{feedback.title}</span>
              {feedback.detail && <span className="whitespace-pre-line text-sm">{feedback.detail}</span>}
              <span className="text-sm">
                {feedback.correct
                  ? "It comes back later, with a new sentence."
                  : "The full card comes back tomorrow, starting again at review 1."}
              </span>
            </div>
            {showCard ? (
              <WordCardView card={w} note={w.note} drawing={w.drawing} />
            ) : (
              <button type="button" className="btn-small self-start" onClick={() => setShowCard(true)}>Show card</button>
            )}
            <button type="button" className="btn-primary" onClick={next}>
              {index + 1 >= items.length ? "Finish" : "Next word"}
            </button>
          </div>
        )}
      </main>
    </>
  );
}

function Hint({ text, label }: { text: string; label: string }) {
  const [open, setOpen] = useState(false);
  return open ? (
    <p className="text-[15px] text-soft">{text}</p>
  ) : (
    <button type="button" className="btn-small self-start" onClick={() => setOpen(true)}>{label}</button>
  );
}
