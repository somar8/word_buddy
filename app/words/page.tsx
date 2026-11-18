"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePrefs } from "@/components/AppShell";
import ConfirmDialog from "@/components/ConfirmDialog";
import PageHeader from "@/components/PageHeader";
import { matchesSearch, searchRank } from "@/lib/practice";
import { dueLabel, stageLabel, statusOf, todayLocal, type WordStatus } from "@/lib/schedule";
import { supabase } from "@/lib/supabase";
import { EXPRESSION_KINDS, KIND_LABEL, type Kind, type Word } from "@/lib/types";

/** The two separate lists: single words, and expressions (phrases, idioms, sayings, sentences). */
type List = "words" | "expressions";
type Filter = "all" | WordStatus;
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "due", label: "Due today" },
  { id: "learning", label: "Learning" },
  { id: "learned", label: "Learned" },
];

type Row = Pick<Word, "id" | "word" | "article" | "meaning_nl" | "meaning_en" | "related" | "note" | "stage" | "due_on" | "kind" | "literal" | "usage">;

const isExpression = (w: Pick<Row, "kind">) => (w.kind ?? "word") !== "word";

export default function WordsPage() {
  const [today] = useState(todayLocal);
  const { language } = usePrefs();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [list, setList] = useState<List>("words");
  const [filter, setFilter] = useState<Filter>("all");
  const [kind, setKind] = useState<Kind | "all">("all");
  const [query, setQuery] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // /words#expressions opens the expressions list (used by links from the Add screen and expression pages).
  useEffect(() => {
    const fromHash = () => setList(window.location.hash === "#expressions" ? "expressions" : "words");
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  useEffect(() => {
    supabase()
      .from("words")
      .select("id, word, article, meaning_nl, meaning_en, related, note, stage, due_on, kind, literal, usage")
      .eq("language", language)
      .order("added_on", { ascending: false })
      .order("created_at", { ascending: false })
      .then(({ data, error: e }) => {
        if (e) setError(e.message);
        else setRows((data ?? []) as Row[]);
      });
  }, [language]);

  const words = useMemo(() => (rows ?? []).filter((w) => !isExpression(w)), [rows]);
  const expressions = useMemo(() => (rows ?? []).filter(isExpression), [rows]);
  const current = list === "words" ? words : expressions;

  const shown = useMemo(() => {
    const matches = current.filter(
      (w) =>
        (filter === "all" || statusOf(w, today) === filter) &&
        (list === "words" || kind === "all" || w.kind === kind) &&
        matchesSearch(w, query),
    );
    return query.trim() ? [...matches].sort((a, b) => searchRank(a, query) - searchRank(b, query)) : matches;
  }, [current, list, filter, kind, query, today]);

  // Matches hidden by a filter, or sitting in the other list, so we can point to them.
  const hidden = query.trim() ? current.filter((w) => matchesSearch(w, query)).length - shown.length : 0;
  const other = list === "words" ? expressions : words;
  const inOther = query.trim() ? other.filter((w) => matchesSearch(w, query)).length : 0;

  function stopSelecting() {
    setSelecting(false);
    setSelected(new Set());
  }

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allShownSelected = shown.length > 0 && shown.every((w) => selected.has(w.id));

  async function deleteSelected(): Promise<string | null> {
    const ids = [...selected];
    const { error: e } = await supabase().from("words").delete().in("id", ids);
    if (e) return `Nothing was deleted: ${e.message}`;
    setRows((r) => (r ?? []).filter((w) => !selected.has(w.id)));
    setNotice(`Deleted ${ids.length} ${ids.length === 1 ? noun : `${noun}s`}.`);
    setConfirming(false);
    stopSelecting();
    return null;
  }

  function switchList(next: List) {
    stopSelecting();
    setNotice(null);
    setList(next);
    setKind("all");
    history.replaceState(null, "", next === "expressions" ? "#expressions" : window.location.pathname);
  }

  const noun = list === "words" ? "word" : "expression";

  return (
    <>
      <PageHeader />
      <div className="flex flex-col gap-3.5 px-5 pb-3 pt-2">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-display text-[28px] font-bold">My list</h1>
          {current.length > 0 && (
            <button type="button" className="btn-small" aria-pressed={selecting}
              onClick={() => { if (selecting) stopSelecting(); else { setSelecting(true); setNotice(null); } }}>
              {selecting ? "Cancel" : "Select"}
            </button>
          )}
        </div>

        <div role="tablist" aria-label="Lists" className="grid grid-cols-2 rounded-xl bg-[#e9ebf0] p-1">
          {(["words", "expressions"] as List[]).map((l) => {
            const count = rows ? (l === "words" ? words.length : expressions.length) : null;
            return (
              <button key={l} type="button" role="tab" aria-selected={list === l} onClick={() => switchList(l)}
                className={`flex h-10 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold ${list === l ? "bg-white text-ink shadow-sm" : "text-soft"}`}>
                {l === "words" ? "Words" : "Expressions"}
                {count !== null && <span className="text-xs font-medium text-muted">{count}</span>}
              </button>
            );
          })}
        </div>

        <div className="relative">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5a6070" strokeWidth="2"
            strokeLinecap="round" aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2">
            <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
          </svg>
          <input type="search" aria-label={`Search your ${noun}s`} value={query}
            placeholder={list === "words" ? "Search a word or meaning" : "Search an expression or meaning"}
            onChange={(e) => setQuery(e.target.value)} enterKeyHint="search" autoCapitalize="none" spellCheck={false}
            className="field h-12 pl-11 pr-11 [&::-webkit-search-cancel-button]:hidden" />
          {query && (
            <button type="button" aria-label="Clear search" onClick={() => setQuery("")}
              className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-lg text-muted">
              ×
            </button>
          )}
        </div>

        <div role="group" aria-label={`Filter ${noun}s by progress`} className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}
              className={`h-9 rounded-full border px-3.5 text-[13px] ${filter === f.id ? "border-ink bg-ink font-semibold text-white" : "border-line bg-white font-medium text-ink"}`}>
              {f.label}
            </button>
          ))}
        </div>

        {list === "expressions" && expressions.length > 0 && (
          <div role="group" aria-label="Filter by kind" className="-mx-5 flex gap-1.5 overflow-x-auto px-5">
            {(["all", ...EXPRESSION_KINDS] as (Kind | "all")[]).map((k) => {
              const n = k === "all" ? expressions.length : expressions.filter((w) => w.kind === k).length;
              return (
                <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} disabled={n === 0}
                  className={`h-8 shrink-0 rounded-lg px-3 text-[13px] font-medium disabled:opacity-40 ${kind === k ? "bg-accent-soft text-accent-dark" : "text-soft"}`}>
                  {k === "all" ? "All kinds" : `${KIND_LABEL[k]}s`} <span className="text-muted">{n}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <main className={`px-5 ${selecting ? "pb-28" : "pb-6"}`}>
        {notice && <p role="status" className="mb-3 rounded-xl bg-good-soft px-4 py-3 text-sm font-medium text-good-ink">{notice}</p>}
        {selecting && shown.length > 0 && (
          <label className="mb-2 flex items-center gap-3 px-1 text-sm font-medium text-soft">
            <input type="checkbox" checked={allShownSelected} className="h-5 w-5 accent-[#2346c8]"
              onChange={() => setSelected(allShownSelected ? new Set() : new Set(shown.map((w) => w.id)))} />
            Select all {shown.length} shown
          </label>
        )}
        {error && <p role="alert" className="text-due-ink">{error}</p>}
        {rows === null && !error && <p className="text-soft" aria-busy="true">Loading…</p>}

        {rows && current.length === 0 && (
          <div className="panel flex flex-col gap-2 p-5">
            <p className="font-semibold">No {noun}s yet.</p>
            <p className="text-sm text-soft">
              {list === "words"
                ? "Add a word you met today and it shows up here."
                : "Phrases, idioms, sayings and sentences you add are kept here, apart from your words."}
            </p>
            <Link href={list === "words" ? "/add" : "/add#expression"} className="btn-small self-start">
              + Add {list === "words" ? "a word" : "an expression"}
            </Link>
          </div>
        )}

        {rows && current.length > 0 && shown.length === 0 && !query.trim() && (
          <p className="pt-2 text-soft">No {noun}s with this filter.</p>
        )}

        {query.trim() && rows && (
          <p role="status" className="pb-2 text-sm text-soft">
            {shown.length} {shown.length === 1 ? "match" : "matches"}
            {hidden > 0 && (
              <> · <button type="button" className="font-medium text-accent" onClick={() => { setFilter("all"); setKind("all"); }}>
                {hidden} more without filters
              </button></>
            )}
            {inOther > 0 && (
              <> · <button type="button" className="font-medium text-accent"
                onClick={() => switchList(list === "words" ? "expressions" : "words")}>
                {inOther} in {list === "words" ? "Expressions" : "Words"}
              </button></>
            )}
          </p>
        )}

        {shown.length > 0 && (
          <ul className="panel overflow-hidden">
            {shown.map((w) => {
              const status = statusOf(w, today);
              return (
                <li key={w.id} className="border-b border-hairline last:border-b-0">
                  <Row selecting={selecting} checked={selected.has(w.id)} onToggle={() => toggle(w.id)} href={`/words/${w.id}`}>
                    <div className="flex min-w-0 flex-col gap-0.5">
                      {list === "expressions" && (
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-accent-dark">{KIND_LABEL[w.kind]}</span>
                      )}
                      <span lang={language} className={`font-semibold leading-snug ${list === "words" ? "text-[17px]" : "text-[16px]"}`}>
                        {w.article && <span className="font-medium text-muted">{w.article} </span>}
                        {w.word}
                      </span>
                      <span lang={language} className="truncate text-[13px] text-muted">{w.meaning_nl}</span>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <StatusPill status={status} label={dueLabel(w.due_on, today)} />
                      <span className="text-xs text-muted">{stageLabel(w.stage)}</span>
                    </div>
                  </Row>
                </li>
              );
            })}
          </ul>
        )}
      </main>

      {selecting && (
        <div className="fixed inset-x-0 bottom-[calc(72px+env(safe-area-inset-bottom))] z-10 border-t border-hairline bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-md items-center gap-3 px-5 py-3">
            <span className="flex-1 text-sm font-medium text-soft">{selected.size} selected</span>
            <button type="button" disabled={selected.size === 0} onClick={() => setConfirming(true)}
              className="inline-flex h-11 items-center rounded-[14px] bg-[#b42318] px-5 text-[15px] font-semibold text-white disabled:opacity-40">
              Delete
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog open={confirming} onCancel={() => setConfirming(false)} onConfirm={deleteSelected}
        title={`Delete ${selected.size} ${selected.size === 1 ? noun : `${noun}s`}?`}
        confirmLabel="Delete for good"
        body={<>
          {selected.size <= 5 && (
            <span lang={language} className="mb-2 block font-medium text-ink">
              {current.filter((w) => selected.has(w.id)).map((w) => w.word).join(", ")}
            </span>
          )}
          Their cards, sentences, drawings and review history are removed. This cannot be undone.
        </>} />
    </>
  );
}

/** A list row: a link normally, a checkbox row while selecting. */
function Row({ selecting, checked, onToggle, href, children }: {
  selecting: boolean;
  checked: boolean;
  onToggle: () => void;
  href: string;
  children: React.ReactNode;
}) {
  if (!selecting) {
    return <Link href={href} className="flex items-center justify-between gap-3 px-4 py-3.5">{children}</Link>;
  }
  return (
    <label className={`flex cursor-pointer items-center gap-3 px-4 py-3.5 ${checked ? "bg-accent-soft/60" : ""}`}>
      <input type="checkbox" checked={checked} onChange={onToggle} className="h-5 w-5 shrink-0 accent-[#2346c8]" />
      <span className="flex min-w-0 flex-1 items-center justify-between gap-3">{children}</span>
    </label>
  );
}

function StatusPill({ status, label }: { status: WordStatus; label: string }) {
  const style =
    status === "due"
      ? "bg-due-soft text-due-ink"
      : status === "learned"
        ? "bg-good-soft text-good-ink"
        : "bg-accent-soft text-accent-dark";
  const text = status === "due" ? "Due today" : status === "learned" ? "Learned" : label;
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${style}`}>{text}</span>;
}
