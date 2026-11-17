"use client";

import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import BottomNav from "./BottomNav";
import Login from "./Login";

const SessionContext = createContext<Session | null>(null);

/** The signed-in user's session. Only used inside the app shell, where it is always set. */
export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession outside a signed-in page");
  return session;
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
        .catch((err) => console.error("Service worker failed", err));
    }
    return () => data.subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return <div className="min-h-dvh" aria-busy="true" />;
  }
  if (!session) return <Login />;

  return (
    <SessionContext.Provider value={session}>
      <div className="mx-auto flex min-h-dvh max-w-md flex-col">
        <div className="flex-1 pb-[calc(88px+env(safe-area-inset-bottom))]">{children}</div>
        <BottomNav />
      </div>
    </SessionContext.Provider>
  );
}
