"use client";

/** Reads Dutch text aloud with the phone's own (free) speech voice. */
export function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "nl-NL";
  const voice = window.speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith("nl"));
  if (voice) utterance.voice = voice;
  utterance.rate = 0.9;
  window.speechSynthesis.speak(utterance);
}

export default function SpeakButton({ text, label = "Play pronunciation", small = false }: {
  text: string;
  label?: string;
  small?: boolean;
}) {
  const size = small ? 36 : 44;
  return (
    <button type="button" aria-label={label} onClick={() => speak(text)}
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
