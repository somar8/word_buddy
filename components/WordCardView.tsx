"use client";

import { useState } from "react";
import { LANG_INFO, toLang } from "@/lib/languages";
import { supportLabel, supportName, translationFirst } from "@/lib/prefs";
import { KIND_LABEL, type Card, type Kind } from "@/lib/types";
import { usePrefs } from "./AppShell";
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
export default function WordCardView({ card, note, drawing, level, language, translation }: {
  card: Omit<Card, "found"> & { kind?: Kind; literal?: string; usage?: string };
  note?: string;
  drawing?: string | null;
  level?: string;
  language?: string;
  translation?: string; // the card's translation language; defaults to the current setting
}) {
  const prefs = usePrefs();
  const lang = toLang(language) ?? prefs.language;
  const t = LANG_INFO[lang].labels;
  const [english, setEnglish] = useState(translationFirst(prefs));
  const full = card.article ? `${card.article} ${card.word}` : card.word;

  return (
    <section aria-label={card.kind && card.kind !== "word" ? "Expression card" : "Word card"} className="panel flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          {card.kind && card.kind !== "word" && (
            <span className="mb-1 self-start rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent-dark">
              {KIND_LABEL[card.kind]}
            </span>
          )}
          <span lang={lang}
            className={`font-display font-bold break-words ${card.kind && card.kind !== "word" ? "text-2xl leading-tight" : "text-3xl"}`}>
            {card.article && <span className="font-medium text-muted">{card.article} </span>}
            {card.word}
          </span>
          <span lang={lang} className="text-[13px] text-muted">
            {[card.part_of_speech, card.forms].filter(Boolean).join(" · ")}
          </span>
          {level && <span className="text-xs text-muted">Card written for level {level}</span>}
        </div>
        <SpeakButton text={full} />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="label">{t.meaning}</span>
        <p lang={lang} className="text-base leading-snug">{card.meaning_nl}</p>
        {card.literal && english && (
          <p className="text-[13px] text-muted"><span className="font-semibold">Literally:</span> <i>{card.literal}</i></p>
        )}
        {english ? (
          <p className="text-[15px] text-soft">{card.meaning_en}</p>
        ) : (
          <button type="button" className="btn-small self-start" onClick={() => setEnglish(true)}>
            Show {translation ? supportLabel(translation) : supportName(prefs)}
          </button>
        )}
      </div>

      {card.usage && (
        <div className="flex flex-col gap-1 rounded-xl bg-ground px-3.5 py-2.5">
          <span className="label">When to use it</span>
          <p className="text-[15px] leading-snug">{card.usage}</p>
        </div>
      )}

      {card.examples.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <span className="label">{t.examples}</span>
          {card.examples.map((ex, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className="flex-1">
                <p lang={lang} className="text-[15px] leading-normal"><Highlight text={ex.nl} word={card.word} /></p>
                {english && <p className="text-[13px] text-muted">{ex.en}</p>}
              </div>
              <SpeakButton text={ex.nl} label="Play sentence" small />
            </div>
          ))}
        </div>
      )}

      {card.related.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="label">{t.related}</span>
          <ul lang={lang} className="flex flex-wrap gap-2">
            {card.related.map((r, i) => (
              <li key={i} className="rounded-full bg-[#f0f1f4] px-3 py-1.5 text-sm">
                {r.word}
                <span className="text-muted"> · {english ? r.en : r.relation}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {drawing && (
        <div className="flex flex-col gap-1.5">
          <span className="label">{t.drawing}</span>
          {/* eslint-disable-next-line @next/next/no-img-element -- a data URL from the database */}
          <img src={drawing} alt={`Your drawing for ${card.word}`}
            className="aspect-square w-40 rounded-xl border border-hairline bg-white" />
        </div>
      )}

      {note && (
        <div className="flex flex-col gap-1">
          <span className="label">{t.note}</span>
          <p className="text-[15px] whitespace-pre-line">{note}</p>
        </div>
      )}
    </section>
  );
}
