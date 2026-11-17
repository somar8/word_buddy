"use client";

import { useState } from "react";
import type { Card } from "@/lib/types";
import SpeakButton from "./SpeakButton";

/** Highlights the target word (or its first 4 letters, to catch inflected forms) in a sentence. */
export function Highlight({ text, word }: { text: string; word: string }) {
  const w = word.toLowerCase();
  const stem = w.length <= 4 ? w : w.slice(0, Math.max(4, w.length - 3));
  const parts = text.split(/(\s+)/);
  return (
    <>
      {parts.map((p, i) =>
        p.trim() && p.toLowerCase().includes(stem) ? (
          <mark key={i} className="rounded bg-accent-soft px-0.5 font-semibold text-ink">{p}</mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

/** Read-only word card: used in the word list and after a review answer. */
export default function WordCardView({ card, note }: { card: Omit<Card, "found">; note?: string }) {
  const [english, setEnglish] = useState(false);
  const full = card.article ? `${card.article} ${card.word}` : card.word;

  return (
    <section aria-label="Word card" className="panel flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span lang="nl" className="font-display text-3xl font-bold break-words">
            {card.article && <span className="font-medium text-muted">{card.article} </span>}
            {card.word}
          </span>
          <span lang="nl" className="text-[13px] text-muted">
            {[card.part_of_speech, card.forms].filter(Boolean).join(" · ")}
          </span>
        </div>
        <SpeakButton text={full} />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="label">Betekenis</span>
        <p lang="nl" className="text-base leading-snug">{card.meaning_nl}</p>
        {english ? (
          <p className="text-[15px] text-soft">{card.meaning_en}</p>
        ) : (
          <button type="button" className="btn-small self-start" onClick={() => setEnglish(true)}>
            Show English
          </button>
        )}
      </div>

      {card.examples.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <span className="label">Voorbeelden</span>
          {card.examples.map((ex, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className="flex-1">
                <p lang="nl" className="text-[15px] leading-normal"><Highlight text={ex.nl} word={card.word} /></p>
                {english && <p className="text-[13px] text-muted">{ex.en}</p>}
              </div>
              <SpeakButton text={ex.nl} label="Play sentence" small />
            </div>
          ))}
        </div>
      )}

      {card.related.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="label">Verwante woorden</span>
          <ul lang="nl" className="flex flex-wrap gap-2">
            {card.related.map((r, i) => (
              <li key={i} className="rounded-full bg-[#f0f1f4] px-3 py-1.5 text-sm">
                {r.word}
                <span className="text-muted"> · {english ? r.en : r.relation}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {note && (
        <div className="flex flex-col gap-1">
          <span className="label">Mijn notitie</span>
          <p className="text-[15px] whitespace-pre-line">{note}</p>
        </div>
      )}
    </section>
  );
}
