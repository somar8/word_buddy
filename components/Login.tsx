"use client";

import { useState } from "react";
import type { Level } from "@/lib/levels";
import { supabase } from "@/lib/supabase";
import LevelPicker from "./LevelPicker";

export default function Login() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [level, setLevel] = useState<Level | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "signup" && !level) {
      setMessage("Choose your Dutch level first.");
      return;
    }
    setBusy(true);
    setMessage(null);
    const auth = supabase().auth;
    const { data, error } =
      mode === "signin"
        ? await auth.signInWithPassword({ email, password })
        : await auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin, data: { level } } });
    setBusy(false);
    if (error) setMessage(error.message);
    else if (mode === "signup" && !data.session) {
      setMessage("Check your email and click the link to confirm your account, then sign in.");
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-6 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-4xl font-bold">Word Buddy</h1>
        <p className="text-soft">Remember every new Dutch word.</p>
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
        </div>
        {mode === "signup" && <LevelPicker value={level} onChange={setLevel} />}
        {message && <p role="status" className="text-sm text-due-ink">{message}</p>}
        <button type="submit" disabled={busy} className="btn-primary">
          {busy ? "One moment…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>
        <button type="button" className="text-sm font-medium text-accent"
          onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMessage(null); }}>
          {mode === "signin" ? "First time? Create an account" : "Already have an account? Sign in"}
        </button>
      </form>
    </main>
  );
}
