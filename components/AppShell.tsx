"use client";

import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState } from "react";
import { toLevel, type Level } from "@/lib/levels";
import { supabase } from "@/lib/supabase";
import BottomNav from "./BottomNav";
import LevelPicker from "./LevelPicker";
import Login from "./Login";

const SessionContext = createContext<Session | null>(null);

/** The signed-in user's session. Only used inside the app shell, where it is always set. */
export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession outside a signed-in page");
  return session;
}

/** The signed-in user's level (A1-C2). The shell asks for it before any page shows. */
export function useLevel(): Level {
  return toLevel(useSession().user.user_metadata?.level) ?? "B1";
}

/** Saves a new level in the user's account; the session (and every page) updates with it. */
export async function saveLevel(level: Level): Promise<string | null> {
  const { error } = await supabase().auth.updateUser({ data: { level } });
  return error ? error.message : null;
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    const client = supabase();
    client.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = client.auth.onAuthStateChange((_event, next) => setSession(next));

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        // Some embedded browsers (for example in-app previews) don't allow service workers.
        // The app works without one; only the daily reminder needs it.
        .catch((err) => console.warn("Reminders are not available in this browser:", err.message));
    }
    return () => data.subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return <div className="min-h-dvh" aria-busy="true" />;
  }
  if (!session) return <Login />;
  if (!toLevel(session.user.user_metadata?.level)) return <ChooseLevel />;

  return (
    <SessionContext.Provider value={session}>
      <div className="mx-auto flex min-h-dvh max-w-md flex-col">
        <div className="flex-1 pb-[calc(88px+env(safe-area-inset-bottom))]">{children}</div>
        <BottomNav />
      </div>
    </SessionContext.Provider>
  );
}

/** Shown once to accounts that have no level yet (for example, made before levels existed). */
function ChooseLevel() {
  const [level, setLevel] = useState<Level | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!level) return;
    setBusy(true);
    const message = await saveLevel(level);
    setBusy(false);
    if (message) setError(message);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-6 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-bold">Choose your level</h1>
        <p className="text-soft">
          Word Buddy writes every meaning, example and exercise for this level. You can change it later in Settings.
        </p>
      </div>
      <LevelPicker value={level} onChange={setLevel} />
      {error && <p role="alert" className="text-sm text-due-ink">{error}</p>}
      <button type="button" className="btn-primary" disabled={!level || busy} onClick={save}>
        {busy ? "Saving…" : "Continue"}
      </button>
    </main>
  );
}
