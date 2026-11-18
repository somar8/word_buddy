"use client";

import { LANG_INFO } from "@/lib/languages";
import { usePrefs } from "./AppShell";

/** Reads text aloud with the phone's own (free) voice for the language being learned. */
export function speak(text: string, tag = "nl-NL", rate = 0.9) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = tag;
  const prefix = tag.slice(0, 2).toLowerCase();
  const voices = window.speechSynthesis.getVoices();
  const voice = voices.find((v) => v.lang === tag) ?? voices.find((v) => v.lang.toLowerCase().startsWith(prefix));
  if (voice) utterance.voice = voice;
  utterance.rate = rate;
  window.speechSynthesis.speak(utterance);
}

export default function SpeakButton({ text, label = "Play pronunciation", small = false }: {
  text: string;
  label?: string;
  small?: boolean;
}) {
  const prefs = usePrefs();
  const size = small ? 36 : 44;
  return (
    <button type="button" aria-label={label} onClick={() => speak(text, LANG_INFO[prefs.language].speech, prefs.speech === "slow" ? 0.7 : 0.95)}
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center rounded-full border border-line bg-white">
      <svg width={small ? 16 : 20} height={small ? 16 : 20} viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M11 5L6 9H2v6h4l5 4V5z" />
        <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      </svg>
    </button>
  );
}
