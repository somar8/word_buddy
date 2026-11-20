"use client";

/**
 * The phone's own speech recognition (free, no AI quota): Chrome, Android and Safari on iPhone.
 * Not every browser has it; then the "Say it" exercise falls back to typing.
 */

type Alternative = { transcript: string };
type Result = { length: number; [i: number]: Alternative };
type RecognitionEvent = { results: { length: number; [i: number]: Result } };
type Recognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  abort: () => void;
};
type RecognitionCtor = new () => Recognition;

function ctor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function canRecognizeSpeech(): boolean {
  return ctor() !== null;
}

export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export class SpeechError extends Error {}

/** Listens once and returns what was heard (best guesses first). Stops by itself after a pause or 8 seconds. */
export function listenOnce(tag: string): Promise<string[]> {
  const C = ctor();
  if (!C) return Promise.reject(new SpeechError("This browser can't listen. Type the answer instead."));
  return new Promise((resolve, reject) => {
    const rec = new C();
    rec.lang = tag;
    rec.interimResults = false;
    rec.maxAlternatives = 5;
    rec.continuous = false;
    let heard: string[] = [];
    const timer = setTimeout(() => rec.abort(), 8000);
    rec.onresult = (e) => {
      const first = e.results[0];
      heard = Array.from({ length: first.length }, (_, i) => first[i].transcript.trim()).filter(Boolean);
    };
    rec.onerror = (e) => {
      clearTimeout(timer);
      const why =
        e.error === "not-allowed" || e.error === "service-not-allowed"
          ? "Microphone access is blocked. Allow it for this site in your phone's settings, or type the answer."
          : e.error === "no-speech"
            ? "I didn't hear anything. Tap the microphone and speak clearly."
            : e.error === "network"
              ? "Speech recognition needs an internet connection."
              : "Speech recognition stopped. Try again, or type the answer.";
      reject(new SpeechError(why));
    };
    rec.onend = () => {
      clearTimeout(timer);
      resolve(heard);
    };
    try {
      rec.start();
    } catch {
      clearTimeout(timer);
      reject(new SpeechError("Speech recognition couldn't start. Try again."));
    }
  });
}
