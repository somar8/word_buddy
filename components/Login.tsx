"use client";

import { useState } from "react";
import { defaultSupport, type Lang, type SupportLang } from "@/lib/languages";
import type { Level } from "@/lib/levels";
import { metaFor } from "@/lib/prefs";
import { supabase } from "@/lib/supabase";
import LevelPicker, { LanguagePicker, SupportSelect } from "./LevelPicker";

/** Where the confirmation email sends people back to (see app/auth/confirm). */
export function confirmUrl(): string {
  return `${window.location.origin}/auth/confirm`;
}

/** Plain-language versions of Supabase's sign-in errors. */
function explain(message: string): { text: string; resend?: boolean } {
  if (/email not confirmed/i.test(message)) {
    return { text: "Your email isn't confirmed yet. Click the link in the email we sent you, or send a new one.", resend: true };
  }
  if (/invalid login credentials/i.test(message)) return { text: "That email and password don't match. Check both and try again." };
  if (/already registered|already exists/i.test(message)) return { text: "This email already has an account. Sign in instead." };
  if (/rate limit|too many/i.test(message)) return { text: "Too many emails were sent. Wait a few minutes, then try again." };
  if (/failed to fetch|network/i.test(message)) return { text: "No connection to the server. Check your internet and try again." };
  return { text: message };
}

export default function Login() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [language, setLanguage] = useState<Lang>("nl");
  const [level, setLevel] = useState<Level | null>(null);
  const [support, setSupport] = useState<SupportLang>(defaultSupport("nl"));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; resend?: boolean; ok?: boolean } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "signup" && !level) {
      setMessage({ text: "Choose your level first." });
      return;
    }
    setBusy(true);
    setMessage(null);
    const auth = supabase().auth;
    const { data, error } =
      mode === "signin"
        ? await auth.signInWithPassword({ email, password })
        : await auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: confirmUrl(),
              data: metaFor({
                language, levels: { [language]: level! }, support, supports: { [language]: support },
                showTranslation: "auto", speech: "normal", dailyGoal: 15,
              }),
            },
          });
    setBusy(false);
    if (error) setMessage(explain(error.message));
    else if (mode === "signup" && !data.session) {
      setMessage({
        ok: true,
        resend: true,
        text: `Almost done! We sent a confirmation link to ${email}. Open it on this device to start.`,
      });
    }
  }

  async function resend() {
    if (!email) {
      setMessage({ text: "Type your email first." });
      return;
    }
    setBusy(true);
    const { error } = await supabase().auth.resend({ type: "signup", email, options: { emailRedirectTo: confirmUrl() } });
    setBusy(false);
    setMessage(error ? explain(error.message) : { ok: true, text: `A new confirmation link is on its way to ${email}.` });
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-7 px-6 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-4xl font-bold">Word Buddy</h1>
        <p className="text-soft">Remember every new word — in Dutch, German or English.</p>
      </div>

      <div role="tablist" aria-label="Account" className="grid grid-cols-2 rounded-xl bg-[#e9ebf0] p-1">
        {(["signin", "signup"] as const).map((m) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m}
            onClick={() => { setMode(m); setMessage(null); }}
            className={`h-10 rounded-lg text-sm font-semibold ${mode === m ? "bg-white text-ink shadow-sm" : "text-soft"}`}>
            {m === "signin" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-semibold text-soft">Email</label>
          <input id="email" type="email" autoComplete="email" required value={email}
            onChange={(e) => setEmail(e.target.value)} className="field h-12" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-sm font-semibold text-soft">Password</label>
          <input id="password" type="password" required minLength={8}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            value={password} onChange={(e) => setPassword(e.target.value)} className="field h-12" />
          {mode === "signup" && <span className="text-xs text-muted">At least 8 characters.</span>}
        </div>
        {mode === "signup" && (
          <>
            <LanguagePicker value={language} onChange={(l) => { setLanguage(l); setSupport(defaultSupport(l)); }} />
            <LevelPicker value={level} onChange={setLevel} />
            <SupportSelect language={language} value={support} onChange={setSupport} id="signup-support" />
          </>
        )}
        {message && (
          <div role="status"
            className={`flex flex-col gap-2 rounded-xl px-4 py-3 text-sm ${message.ok ? "bg-good-soft text-good-ink" : "bg-due-soft text-due-ink"}`}>
            <span>{message.text}</span>
            {message.resend && (
              <button type="button" onClick={resend} disabled={busy} className="self-start font-semibold underline">
                Send the confirmation email again
              </button>
            )}
          </div>
        )}
        <button type="submit" disabled={busy} className="btn-primary">
          {busy ? "One moment…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>
      </form>
    </main>
  );
}
