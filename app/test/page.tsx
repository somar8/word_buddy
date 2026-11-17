"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import SpeakButton from "@/components/SpeakButton";
import { englishOf, gapFromExamples } from "@/lib/practice";
import { fullWord, normalize, stableShuffle, todayLocal } from "@/lib/schedule";
import { api, supabase } from "@/lib/supabase";
import type { AiTask, Word } from "@/lib/types";

const MAX_WORDS = 20;

type TestWord = Pick<
  Word,
  "id" | "word" | "article" | "meaning_en" | "examples" | "review_task" | "review_task_on" | "added_on" | "due_on"
>;
type Source = "added" | "due" | "recent";
type Phase = "pick" | "match" | "write" | "results";
type Gap = { task: AiTask | null; given: string; result: "right" | "wrong" | null };

const SOURCE_LABEL: Record<Source, string> = {
  added: "Added today",
  due: "Due today",
  recent: "My last 10 words",
};

export default function TestPage() {
  const [today] = useState(todayLocal);
  const [all, setAll] = useState<TestWord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<Source>("added");
  const [phase, setPhase] = useState<Phase>("pick");
  const [words, setWords] = useState<TestWord[]>([]);
  const [round, setRound] = useState(0);

  useEffect(() => {
    supabase()
      .from("words")
      .select("id, word, article, meaning_en, examples, review_task, review_task_on, added_on, due_on")
      .or(`added_on.eq.${today},due_on.lte.${today}`)
      .order("created_at", { ascending: false })
      .limit(100)
      .then(async ({ data, error: e }) => {
        if (e) return setError(e.message);
        let list = (data ?? []) as TestWord[];
        if (list.length === 0) {
          const recent = await supabase()
            .from("words")
            .select("id, word, article, meaning_en, examples, review_task, review_task_on, added_on, due_on")
            .order("created_at", { ascending: false })
            .limit(10);
          list = (recent.data ?? []) as TestWord[];
          setSource("recent");
        } else if (!list.some((w) => w.added_on === today)) {
          setSource("due");
        }
        setAll(list);
      });
  }, [today]);

  const pools = useMemo(() => {
    const list = all ?? [];
    return {
      added: list.filter((w) => w.added_on === today),
      due: list.filter((w) => w.due_on <= today),
      recent: list.slice(0, 10),
    } satisfies Record<Source, TestWord[]>;
  }, [all, today]);

  function start() {
    setWords(pools[source].slice(0, MAX_WORDS));
    setRound((r) => r + 1);
    setPhase("match");
  }

  return (
    <>
      <PageHeader title="Today's test" />
      <main className="flex flex-col gap-4 px-5 pb-6 pt-2">
        {error && <p role="alert" className="text-due-ink">{error}</p>}
        {!all && !error && <p className="text-soft" aria-busy="true">Loading…</p>}

        {all && phase === "pick" && (
          all.length === 0 ? (
            <div className="panel flex flex-col gap-3 p-5">
              <h1 className="font-display text-2xl font-bold">No words to test yet</h1>
              <p className="text-soft">Add a few words first, then come back for a test.</p>
              <Link href="/add" className="btn-primary">Add a word</Link>
            </div>
          ) : (
            <>
              <h1 className="font-display text-[28px] font-bold">Test yourself</h1>
              <ol className="panel flex flex-col gap-3 p-5 text-[15px]">
                <li className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[13px] font-bold text-accent-dark">1</span>
                  <span><strong>Match</strong> — connect each English meaning with its Dutch word.</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[13px] font-bold text-accent-dark">2</span>
                  <span><strong>Write</strong> — type the missing word in a sentence, one tab per word.</span>
                </li>
              </ol>
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-sm font-semibold text-soft">Which words?</legend>
                {(["added", "due", "recent"] as Source[]).map((s) => (
                  <label key={s}
                    className={`flex cursor-pointer items-center justify-between rounded-xl border px-4 py-3 ${source === s ? "border-accent bg-accent-soft" : "border-line bg-white"} ${pools[s].length === 0 ? "opacity-50" : ""}`}>
                    <span className="flex items-center gap-3">
                      <input type="radio" name="source" checked={source === s} disabled={pools[s].length === 0}
                        onChange={() => setSource(s)} className="h-4 w-4 accent-[#2346c8]" />
                      <span className="font-medium">{SOURCE_LABEL[s]}</span>
                    </span>
                    <span className="text-sm text-muted">{Math.min(pools[s].length, MAX_WORDS)} words</span>
                  </label>
                ))}
              </fieldset>
              <button type="button" className="btn-primary" disabled={pools[source].length === 0} onClick={start}>
                Start the test
              </button>
              <p className="text-xs text-muted">Practice only: the test does not change your review plan.</p>
            </>
          )
        )}

        {phase === "match" && (
          <MatchStep key={round} words={words} seed={`${today}-${round}`} onDone={() => setPhase("write")} />
        )}
        {(phase === "write" || phase === "results") && (
          <WriteStep key={round} words={words} today={today} results={phase === "results"}
            onDone={() => setPhase("results")} onAgain={() => setPhase("pick")} />
        )}
      </main>
    </>
  );
}

/* ---------- Step 1: match English with Dutch ---------- */

function MatchStep({ words, seed, onDone }: { words: TestWord[]; seed: string; onDone: () => void }) {
  const left = useMemo(() => stableShuffle(words, `${seed}-en`), [words, seed]);
  const right = useMemo(() => stableShuffle(words, `${seed}-nl`), [words, seed]);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [pickedEn, setPickedEn] = useState<string | null>(null);
  const [pickedNl, setPickedNl] = useState<string | null>(null);
  const [wrong, setWrong] = useState<[string, string] | null>(null);
  const [mistakes, setMistakes] = useState(0);

  function tryPair(en: string | null, nl: string | null) {
    if (!en || !nl) return;
    const a = words.find((w) => w.id === en)!;
    const b = words.find((w) => w.id === nl)!;
    // Two words can share an English meaning; then either Dutch word is right.
    if (en === nl || englishOf(a.meaning_en).toLowerCase() === englishOf(b.meaning_en).toLowerCase()) {
      const next = new Set(matched);
      next.add(`en:${en}`);
      next.add(`nl:${nl}`);
      setMatched(next);
    } else {
      setMistakes((m) => m + 1);
      setWrong([en, nl]);
      setTimeout(() => setWrong(null), 700);
    }
    setPickedEn(null);
    setPickedNl(null);
  }

  const done = matched.size === words.length * 2;
  const count = matched.size / 2;

  const base = "flex min-h-14 w-full items-center rounded-xl border px-3 py-2 text-left text-[15px] leading-snug transition-colors";
  function style(side: "en" | "nl", id: string) {
    if (matched.has(`${side}:${id}`)) return `${base} border-transparent bg-good-soft text-good-ink`;
    if (wrong && wrong[side === "en" ? 0 : 1] === id) return `${base} border-due bg-due-soft text-due-ink`;
    if ((side === "en" ? pickedEn : pickedNl) === id) return `${base} border-accent bg-accent-soft font-semibold`;
    return `${base} border-line bg-white`;
  }

  return (
    <section aria-labelledby="match-title" className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <h1 id="match-title" className="font-display text-2xl font-bold">1 · Match the words</h1>
        <span className="text-sm text-soft">{count} / {words.length}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-hairline" aria-hidden="true">
        <div className="h-full bg-accent transition-all" style={{ width: `${(count / words.length) * 100}%` }} />
      </div>
      <p className="text-[15px] text-soft">Tap an English meaning, then the Dutch word that goes with it.</p>

      <div className="grid grid-cols-2 gap-2.5">
        <div className="flex flex-col gap-2">
          <span className="label">English</span>
          {left.map((w) => (
            <button key={w.id} type="button" className={style("en", w.id)} disabled={matched.has(`en:${w.id}`)}
              aria-pressed={pickedEn === w.id}
              onClick={() => { setPickedEn(w.id); tryPair(w.id, pickedNl); }}>
              {matched.has(`en:${w.id}`) && <span aria-hidden="true" className="mr-1.5">✓</span>}
              {englishOf(w.meaning_en)}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <span className="label">Nederlands</span>
          {right.map((w) => (
            <button key={w.id} type="button" lang="nl" className={`${style("nl", w.id)} font-medium`}
              disabled={matched.has(`nl:${w.id}`)} aria-pressed={pickedNl === w.id}
              onClick={() => { setPickedNl(w.id); tryPair(pickedEn, w.id); }}>
              {matched.has(`nl:${w.id}`) && <span aria-hidden="true" className="mr-1.5">✓</span>}
              {fullWord(w)}
            </button>
          ))}
        </div>
      </div>

      <p role="status" className="text-sm text-soft">
        {wrong ? "Not a pair — try again." : done ? `All matched${mistakes ? ` with ${mistakes} mistake${mistakes > 1 ? "s" : ""}` : " without mistakes"}!` : ""}
      </p>
      {done && <button type="button" className="btn-primary" onClick={onDone}>Next: write the words</button>}
    </section>
  );
}

/* ---------- Step 2: one sentence per tab, type the word ---------- */

function WriteStep({ words, today, results, onDone, onAgain }: {
  words: TestWord[];
  today: string;
  results: boolean;
  onDone: () => void;
  onAgain: () => void;
}) {
  const [gaps, setGaps] = useState<Record<string, Gap> | null>(null);
  const [tab, setTab] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [showEn, setShowEn] = useState(false);

  useEffect(() => {
    let alive = true;
    async function load() {
      const tasks: Record<string, AiTask> = {};
      words.forEach((w) => {
        if (w.review_task && w.review_task_on === today) tasks[w.id] = w.review_task;
      });
      const missing = words.filter((w) => !tasks[w.id]).map((w) => w.id);
      if (missing.length > 0) {
        try {
          const res = await api<{ tasks: Record<string, AiTask> }>("/api/tasks", { ids: missing, today });
          Object.assign(tasks, res.tasks);
        } catch (err) {
          if (alive) setNotice(`${(err as Error).message} Using your example sentences instead.`);
        }
      }
      if (!alive) return;
      const out: Record<string, Gap> = {};
      words.forEach((w) => {
        out[w.id] = { task: tasks[w.id] ?? gapFromExamples(w), given: "", result: null };
      });
      setGaps(out);
    }
    load();
    return () => {
      alive = false;
    };
  }, [words, today]);

  if (!gaps) {
    return <p className="text-soft" aria-busy="true">Making a sentence for each word…</p>;
  }

  const w = words[tab];
  const g = gaps[w.id];
  const answered = words.filter((x) => gaps[x.id].result).length;
  const right = words.filter((x) => gaps[x.id].result === "right").length;

  function setGiven(value: string) {
    setGaps((all) => all && { ...all, [w.id]: { ...all[w.id], given: value } });
  }

  function check(e: React.FormEvent) {
    e.preventDefault();
    if (!g.given.trim() || g.result) return;
    const given = normalize(g.given);
    const options = [g.task?.answer ?? "", w.word, fullWord(w)].filter(Boolean).map(normalize);
    const result = options.includes(given) ? "right" : "wrong";
    setGaps((all) => all && { ...all, [w.id]: { ...all[w.id], result } });
  }

  function nextTab() {
    setShowEn(false);
    const after = words.findIndex((x, i) => i > tab && !gaps![x.id].result);
    const before = words.findIndex((x) => !gaps![x.id].result && x.id !== w.id);
    const next = after >= 0 ? after : before;
    if (next >= 0) setTab(next);
    else onDone();
  }

  if (results) {
    return (
      <section aria-labelledby="results-title" className="flex flex-col gap-4">
        <h1 id="results-title" className="font-display text-2xl font-bold">Test done</h1>
        <div className="panel flex flex-col items-center gap-1 p-6">
          <span className="font-display text-5xl font-bold">{right}/{words.length}</span>
          <span className="text-soft">sentences right</span>
        </div>
        <ul className="panel overflow-hidden">
          {words.map((x) => (
            <li key={x.id} className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3 last:border-b-0">
              <span lang="nl" className="font-semibold">{fullWord(x)}</span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${gaps[x.id].result === "right" ? "bg-good-soft text-good-ink" : "bg-due-soft text-due-ink"}`}>
                {gaps[x.id].result === "right" ? "Right" : "Practise again"}
              </span>
            </li>
          ))}
        </ul>
        <button type="button" className="btn-primary" onClick={onAgain}>New test</button>
        <Link href="/review" className="btn-secondary">Go to today&apos;s review</Link>
      </section>
    );
  }

  const parts = g.task ? g.task.sentence.split("___") : null;

  return (
    <section aria-labelledby="write-title" className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <h1 id="write-title" className="font-display text-2xl font-bold">2 · Write the word</h1>
        <span className="text-sm text-soft">{answered} / {words.length}</span>
      </div>
      {notice && <p className="rounded-xl bg-due-soft px-4 py-3 text-sm text-due-ink">{notice}</p>}

      <div role="tablist" aria-label="Sentences" className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
        {words.map((x, i) => {
          const r = gaps[x.id].result;
          const selected = i === tab;
          return (
            <button key={x.id} type="button" role="tab" aria-selected={selected} aria-controls="sentence-panel"
              aria-label={`Sentence ${i + 1}${r ? (r === "right" ? ", right" : ", wrong") : ""}`}
              onClick={() => { setTab(i); setShowEn(false); }}
              className={`flex h-10 min-w-10 shrink-0 items-center justify-center rounded-full border text-sm font-semibold ${
                r === "right" ? "border-transparent bg-good-soft text-good-ink"
                  : r === "wrong" ? "border-transparent bg-due-soft text-due-ink"
                    : "border-line bg-white text-ink"
              } ${selected ? "ring-2 ring-accent ring-offset-2" : ""}`}>
              {r === "right" ? "✓" : r === "wrong" ? "✗" : i + 1}
            </button>
          );
        })}
      </div>

      <form id="sentence-panel" role="tabpanel" aria-label={`Sentence ${tab + 1}`} onSubmit={check}
        className="panel flex flex-col gap-4 p-5">
        {parts ? (
          <p lang="nl" className="text-xl leading-relaxed">
            {parts[0]}
            <span className="mx-1 inline-block min-w-16 border-b-2 border-accent text-center font-semibold text-accent-dark">
              {g.result ? (g.result === "right" ? g.given.trim() : g.task!.answer) : " "}
            </span>
            {parts.slice(1).join("___")}
          </p>
        ) : (
          <p className="text-xl leading-relaxed">Type the Dutch word for: <strong>{englishOf(w.meaning_en)}</strong></p>
        )}

        {parts && g.task!.en && (showEn ? (
          <p className="text-[15px] text-soft">{g.task!.en}</p>
        ) : (
          <button type="button" className="btn-small self-start" onClick={() => setShowEn(true)}>Show English</button>
        ))}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="gap-answer" className="text-[13px] font-semibold text-soft">Your answer</label>
          <input id="gap-answer" key={w.id} lang="nl" autoComplete="off" autoCapitalize="none" spellCheck={false}
            autoFocus value={g.given} readOnly={g.result !== null} onChange={(e) => setGiven(e.target.value)}
            className="field h-12 text-[17px]" />
        </div>

        {g.result && (
          <div role="status"
            className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3 ${g.result === "right" ? "bg-good-soft text-good-ink" : "bg-due-soft text-due-ink"}`}>
            <span lang="nl" className="font-semibold">
              {g.result === "right" ? "Goed!" : `The answer: ${g.task?.answer ?? fullWord(w)}`}
            </span>
            <SpeakButton text={g.task ? g.task.sentence.replace("___", g.task.answer) : fullWord(w)} label="Play sentence" small />
          </div>
        )}

        {g.result ? (
          <button type="button" className="btn-primary" onClick={nextTab}>
            {answered === words.length ? "See results" : "Next sentence"}
          </button>
        ) : (
          <button type="submit" className="btn-primary" disabled={!g.given.trim()}>Check</button>
        )}
      </form>
    </section>
  );
}
