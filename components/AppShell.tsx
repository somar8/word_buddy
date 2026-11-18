"use client";

import type { Session } from "@supabase/supabase-js";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import { defaultSupport, type Lang, type SupportLang } from "@/lib/languages";
import type { Level } from "@/lib/levels";
import { metaFor, prefsFrom, withLanguage, withSupport, type Prefs } from "@/lib/prefs";
import { supabase } from "@/lib/supabase";
import BottomNav from "./BottomNav";
import LevelPicker, { LanguagePicker, SupportSelect } from "./LevelPicker";
import Login from "./Login";

const SessionContext = createContext<Session | null>(null);

/** The signed-in user's session. Only used inside the app shell, where it is always set. */
export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession outside a signed-in page");
  return session;
}

/** The signed-in user's preferences (language, level, translation…). */
export function usePrefs(): Prefs & { level: Level } {
  const prefs = prefsFrom(useSession().user.user_metadata);
  return { ...prefs, level: prefs.level ?? "B1" };
}

/** The level for the language being learned. The shell asks for it before any page shows. */
export function useLevel(): Level {
  return usePrefs().level;
}

/** Saves preferences in the user's account; the session (and every page) updates with them. */
export async function savePrefs(change: Partial<Omit<Prefs, "level">>): Promise<string | null> {
  const client = supabase();
  const { data } = await client.auth.getSession();
  let next = { ...prefsFrom(data.session?.user.user_metadata), ...change };
  // A new learning language brings its own translation language, unless one is given.
  if (change.language) next = change.support ? withSupport(withLanguage(next, change.language), change.support) : withLanguage(next, change.language);
  else if (change.support) next = withSupport(next, change.support);
  const { error } = await client.auth.updateUser({ data: metaFor(next) });
  return error ? error.message : null;
}

/** Pages that work without signing in (they handle the sign-in themselves). */
const PUBLIC_PATHS = ["/auth/"];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
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

  if (PUBLIC_PATHS.some((p) => path.startsWith(p))) return <>{children}</>;
  if (session === undefined) {
    return <div className="min-h-dvh" aria-busy="true" />;
  }
  if (!session) return <Login />;
  if (!prefsFrom(session.user.user_metadata).level) return <ChooseLevel session={session} />;

  return (
    <SessionContext.Provider value={session}>
      <div className="mx-auto flex min-h-dvh max-w-md flex-col">
        <div className="flex-1 pb-[calc(88px+env(safe-area-inset-bottom))]">{children}</div>
        <BottomNav />
      </div>
    </SessionContext.Provider>
  );
}

/** Shown when the account has no level for its language yet (new language, or an older account). */
function ChooseLevel({ session }: { session: Session }) {
  const prefs = prefsFrom(session.user.user_metadata);
  const [language, setLanguage] = useState<Lang>(prefs.language);
  const [level, setLevel] = useState<Level | null>(prefs.levels[prefs.language] ?? null);
  const [support, setSupport] = useState<SupportLang>(prefs.support);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!level) return;
    setBusy(true);
    const message = await savePrefs({ language, support, levels: { ...prefs.levels, [language]: level } });
    setBusy(false);
    if (message) setError(message);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-bold">Set up Word Buddy</h1>
        <p className="text-soft">
          Every meaning, example and exercise is written for your level. You can change both later in Settings.
        </p>
      </div>
      <LanguagePicker value={language}
        onChange={(l) => { setLanguage(l); setLevel(prefs.levels[l] ?? null); setSupport(prefs.supports[l] ?? defaultSupport(l)); }} />
      <LevelPicker value={level} onChange={setLevel} />
      <SupportSelect language={language} value={support} onChange={setSupport} id="setup-support" />
      {error && <p role="alert" className="text-sm text-due-ink">{error}</p>}
      <button type="button" className="btn-primary" disabled={!level || busy} onClick={save}>
        {busy ? "Saving…" : "Continue"}
      </button>
    </main>
  );
}
