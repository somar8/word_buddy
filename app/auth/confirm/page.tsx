"use client";

import type { EmailOtpType } from "@supabase/supabase-js";
import Link from "next/link";
import { useEffect, useState } from "react";
import { confirmUrl } from "@/components/Login";
import { supabase } from "@/lib/supabase";

type State =
  | { kind: "checking" }
  | { kind: "ask"; tokenHash: string; type: EmailOtpType } // link from the custom email template
  | { kind: "confirmed" }
  | { kind: "failed"; text: string }
  | { kind: "nothing" };

function explain(code: string | null, description: string | null): string {
  if (code === "otp_expired" || /expired|invalid/i.test(description ?? "")) {
    return "This link has expired or was already used. Links work once and for 24 hours. Send yourself a new one below.";
  }
  if (code === "access_denied") return "This link could not be used. Send yourself a new one below.";
  return description || "This link could not be used. Send yourself a new one below.";
}

/**
 * The page the confirmation email links to. It handles all three ways Supabase can send people here:
 *  - ?token_hash=…&type=… (custom email template; works on any device and is safe from link scanners)
 *  - #access_token=… or ?code=… (Supabase's default template; the client library signs in automatically)
 *  - #error=… (expired or already used link)
 */
export default function ConfirmPage() {
  const [state, setState] = useState<State>({ kind: "checking" });
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<string | null>(null);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const errorCode = hash.get("error_code") ?? query.get("error_code");
    const errorText = hash.get("error_description") ?? query.get("error_description");
    const tokenHash = query.get("token_hash");
    const type = query.get("type") as EmailOtpType | null;

    async function run() {
      if (errorCode || errorText) {
        setState({ kind: "failed", text: explain(errorCode, errorText) });
        return;
      }
      if (tokenHash && type) {
        // Wait for a tap, so email link scanners can't use up the one-time link.
        setState({ kind: "ask", tokenHash, type });
        return;
      }
      const client = supabase();
      const code = query.get("code");
      if (code) {
        const { error } = await client.auth.exchangeCodeForSession(code);
        if (error) {
          setState({ kind: "failed", text: "This link was opened on another device or browser. Sign in with your email and password instead — your email is confirmed if you opened the link." });
          return;
        }
      }
      const { data } = await client.auth.getSession();
      setState(data.session ? { kind: "confirmed" } : { kind: "nothing" });
    }
    run();
  }, []);

  async function confirm() {
    if (state.kind !== "ask") return;
    setState({ kind: "checking" });
    const { error } = await supabase().auth.verifyOtp({ token_hash: state.tokenHash, type: state.type });
    setState(error ? { kind: "failed", text: explain(null, error.message) } : { kind: "confirmed" });
  }

  async function resend(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase().auth.resend({ type: "signup", email, options: { emailRedirectTo: confirmUrl() } });
    setSent(error ? error.message : `A new link is on its way to ${email}.`);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 px-6 py-10">
      <h1 className="font-display text-3xl font-bold">Word Buddy</h1>

      {state.kind === "checking" && <p className="text-soft" aria-busy="true">Checking your link…</p>}

      {state.kind === "ask" && (
        <>
          <p className="text-[17px]">One tap to confirm your email address.</p>
          <button type="button" className="btn-primary" onClick={confirm}>Confirm my email</button>
        </>
      )}

      {state.kind === "confirmed" && (
        <>
          <div role="status" className="rounded-xl bg-good-soft px-4 py-3 text-good-ink">
            <strong>Your email is confirmed.</strong> You&apos;re signed in.
          </div>
          <Link href="/add" className="btn-primary">Start learning</Link>
        </>
      )}

      {state.kind === "nothing" && (
        <>
          <p className="text-soft">Open the link from your confirmation email to finish creating your account.</p>
          <Link href="/add" className="btn-secondary">Go to sign in</Link>
        </>
      )}

      {state.kind === "failed" && (
        <>
          <p role="alert" className="rounded-xl bg-due-soft px-4 py-3 text-due-ink">{state.text}</p>
          <form onSubmit={resend} className="flex flex-col gap-2">
            <label htmlFor="resend-email" className="text-sm font-semibold text-soft">Your email</label>
            <input id="resend-email" type="email" required autoComplete="email" value={email}
              onChange={(e) => setEmail(e.target.value)} className="field h-12" />
            <button type="submit" className="btn-primary">Send a new link</button>
            {sent && <p role="status" className="text-sm text-soft">{sent}</p>}
          </form>
          <Link href="/add" className="btn-secondary">Go to sign in</Link>
        </>
      )}
    </main>
  );
}
