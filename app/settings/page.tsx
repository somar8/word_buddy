"use client";

import { useEffect, useState } from "react";
import { saveLevel, useLevel, useSession } from "@/components/AppShell";
import LevelPicker from "@/components/LevelPicker";
import PageHeader from "@/components/PageHeader";
import type { Level } from "@/lib/levels";
import { api, supabase } from "@/lib/supabase";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type PushState = "checking" | "unsupported" | "install-first" | "off" | "on" | "blocked";

export default function SettingsPage() {
  const session = useSession();
  const [push, setPush] = useState<PushState>("checking");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    async function check() {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setPush(ios && !standalone ? "install-first" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        setPush("blocked");
        return;
      }
      // In browsers that block service workers, "ready" never settles: give up after 5 seconds.
      const reg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
      ]);
      if (!reg) {
        setPush("unsupported");
        return;
      }
      const sub = await reg.pushManager.getSubscription();
      setPush(sub ? "on" : "off");
    }
    check();
  }, []);

  async function turnOn() {
    setBusy(true);
    setMessage(null);
    try {
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) throw new Error("Reminders are not set up on the server yet (missing VAPID key).");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPush(permission === "denied" ? "blocked" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
      const json = sub.toJSON();
      const { error } = await supabase().from("push_subscriptions").upsert(
        { endpoint: json.endpoint, p256dh: json.keys?.p256dh, auth: json.keys?.auth },
        { onConflict: "endpoint" },
      );
      if (error) throw new Error(error.message);
      setPush("on");
      setMessage("Reminders are on.");
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    setMessage(null);
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await supabase().from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
      await sub.unsubscribe();
    }
    setPush("off");
    setBusy(false);
  }

  async function test() {
    setBusy(true);
    setMessage(null);
    try {
      const { sent } = await api<{ sent: number }>("/api/push/test", {});
      setMessage(sent > 0 ? "Test sent. It should arrive in a few seconds." : "No device is subscribed yet.");
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Settings" />
      <main className="flex flex-col gap-4 px-5 pb-6 pt-2">
        <LevelSection />

        <section aria-labelledby="reminders" className="panel flex flex-col gap-3 p-5">
          <h2 id="reminders" className="font-display text-lg font-bold">Daily reminder</h2>
          <p className="text-[15px] leading-relaxed text-soft">
            Once a day, in the morning between about 8:00 and 10:00, you get one notification with the number of
            words waiting for you.
          </p>
          {push === "checking" && <p className="text-soft">Checking…</p>}
          {push === "install-first" && (
            <p className="text-[15px]">
              On iPhone, first add Word Buddy to your home screen: tap <strong>Share</strong>, then{" "}
              <strong>Add to Home Screen</strong>. Open it from there and come back to this page.
            </p>
          )}
          {push === "unsupported" && (
            <p className="text-[15px]">
              This browser cannot show notifications. Open Word Buddy in Chrome or Safari, or on your phone.
            </p>
          )}
          {push === "blocked" && (
            <p className="text-[15px]">Notifications are blocked. Allow them for this site in your phone&apos;s settings.</p>
          )}
          {push === "off" && (
            <button type="button" className="btn-primary" onClick={turnOn} disabled={busy}>Turn on reminders</button>
          )}
          {push === "on" && (
            <div className="flex flex-col gap-2">
              <button type="button" className="btn-secondary" onClick={test} disabled={busy}>Send a test notification</button>
              <button type="button" className="btn-secondary" onClick={turnOff} disabled={busy}>Turn off on this device</button>
            </div>
          )}
          {message && <p role="status" className="text-sm text-soft">{message}</p>}
        </section>

        <section aria-labelledby="account" className="panel flex flex-col gap-3 p-5">
          <h2 id="account" className="font-display text-lg font-bold">Account</h2>
          <p className="text-[15px] text-soft">Signed in as {session.user.email}</p>
          <button type="button" className="btn-secondary" onClick={() => supabase().auth.signOut()}>Sign out</button>
        </section>
      </main>
    </>
  );
}

function LevelSection() {
  const current = useLevel();
  const [level, setLevel] = useState<Level>(current);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setMessage(null);
    const error = await saveLevel(level);
    setBusy(false);
    setMessage(error ?? `Level set to ${level}.`);
  }

  return (
    <section id="level" aria-labelledby="level-title" className="panel flex scroll-mt-4 flex-col gap-3 p-5">
      <h2 id="level-title" className="font-display text-lg font-bold">Level</h2>
      <p className="text-[15px] leading-relaxed text-soft">
        New cards, exercises and tests are written for this level. Words you already saved keep their card.
      </p>
      <LevelPicker value={level} onChange={(l) => { setLevel(l); setMessage(null); }} />
      <button type="button" className="btn-primary" disabled={busy || level === current} onClick={save}>
        {busy ? "Saving…" : "Save level"}
      </button>
      {message && <p role="status" className="text-sm text-soft">{message}</p>}
    </section>
  );
}
