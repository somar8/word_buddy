"use client";

import { useEffect, useState } from "react";
import { savePrefs, usePrefs, useSession } from "@/components/AppShell";
import ConfirmDialog from "@/components/ConfirmDialog";
import LevelPicker, { LanguagePicker, Segmented } from "@/components/LevelPicker";
import PageHeader from "@/components/PageHeader";
import { LANG_INFO, SUPPORT_LANGUAGES, type Lang, type SupportLang } from "@/lib/languages";
import type { Level } from "@/lib/levels";
import { DAILY_GOALS, withLanguage, withSupport, type Prefs, type ShowTranslation, type SpeechSpeed } from "@/lib/prefs";
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
        <PreferencesSection />

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

        <AccountSection email={session.user.email ?? ""} />
      </main>
    </>
  );
}

/** Language, level, translations and voice, saved together in the account. */
function PreferencesSection() {
  const current = usePrefs();
  const [draft, setDraft] = useState<Prefs>(current);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const level = draft.levels[draft.language] ?? null;
  const changed = JSON.stringify({ ...draft, level }) !== JSON.stringify(current);
  const supportOptions = (Object.keys(SUPPORT_LANGUAGES) as SupportLang[]).filter((l) => l !== draft.language);

  function set(change: Partial<Prefs>) {
    setDraft((d) => {
      if (change.language) return withLanguage(d, change.language);
      if (change.support) return withSupport(d, change.support);
      return { ...d, ...change };
    });
    setMessage(null);
  }

  async function save() {
    if (!level) {
      setMessage({ ok: false, text: `Choose your ${LANG_INFO[draft.language].name} level first.` });
      return;
    }
    setBusy(true);
    const error = await savePrefs(draft);
    setBusy(false);
    setMessage(error ? { ok: false, text: error } : { ok: true, text: "Preferences saved." });
  }

  return (
    <section id="preferences" aria-labelledby="preferences-title" className="panel flex scroll-mt-4 flex-col gap-4 p-5">
      <div className="flex flex-col gap-1">
        <h2 id="preferences-title" className="font-display text-lg font-bold">Preferences</h2>
        <p className="text-sm text-soft">New cards, exercises and tests follow these. Saved words keep their card.</p>
      </div>

      <LanguagePicker value={draft.language} onChange={(language) => set({ language })} />
      <p className="-mt-2 text-xs text-muted">Each language keeps its own words and level.</p>

      <LevelPicker legend={`My ${LANG_INFO[draft.language].name} level`} value={level}
        onChange={(l: Level) => set({ levels: { ...draft.levels, [draft.language]: l } })} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="support" className="text-sm font-semibold text-soft">
          Translate my {LANG_INFO[draft.language].name} words into
        </label>
        <select id="support" value={draft.support} onChange={(e) => set({ support: e.target.value as SupportLang })}
          className="field h-11">
          {supportOptions.map((l) => <option key={l} value={l}>{SUPPORT_LANGUAGES[l]}</option>)}
        </select>
        <span className="text-xs text-muted">
          Each language has its own setting. Cards you already saved keep the translation they were made with.
        </span>
        <RetranslateAll language={current.language} support={current.support} disabled={changed}
          note={changed ? "Save your preferences first." : null} />
      </div>

      <div className="flex flex-col gap-1">
        <Segmented<ShowTranslation> legend="Translations on cards" name="show" columns={3} value={draft.showTranslation}
          onChange={(showTranslation) => set({ showTranslation })}
          options={[{ value: "auto", label: "Auto" }, { value: "always", label: "Always" }, { value: "tap", label: "On tap" }]} />
        <p className="text-xs text-muted">Auto shows them straight away at A1–A2, and behind a button from B1.</p>
      </div>

      <Segmented<SpeechSpeed> legend="Pronunciation speed" name="speech" columns={2} value={draft.speech}
        onChange={(speech) => set({ speech })}
        options={[{ value: "slow", label: "Slow" }, { value: "normal", label: "Normal" }]} />

      <Segmented<string> legend="Daily goal (reviews a day)" name="goal" columns={5} value={String(draft.dailyGoal)}
        onChange={(v) => set({ dailyGoal: Number(v) })}
        options={DAILY_GOALS.map((g) => ({ value: String(g), label: String(g) }))} />

      <button type="button" className="btn-primary" disabled={busy || !changed} onClick={save}>
        {busy ? "Saving…" : "Save preferences"}
      </button>
      {message && (
        <p role="status" className={`text-sm ${message.ok ? "text-good-ink" : "text-due-ink"}`}>{message.text}</p>
      )}
    </section>
  );
}

type Profile = { created_at: string; confirmed_at: string | null; last_sign_in_at: string | null; sign_in_count: number };

function AccountSection({ email }: { email: string }) {
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    supabase()
      .from("profiles")
      .select("created_at, confirmed_at, last_sign_in_at, sign_in_count")
      .maybeSingle()
      .then(({ data }) => setProfile(data as Profile | null));
  }, []);

  const date = (iso: string | null) =>
    iso ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso)) : "—";

  return (
    <section aria-labelledby="account" className="panel flex flex-col gap-3 p-5">
      <h2 id="account" className="font-display text-lg font-bold">Account</h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-muted">Email</dt><dd className="truncate font-medium">{email}</dd>
        {profile && (
          <>
            <dt className="text-muted">Member since</dt><dd>{date(profile.created_at)}</dd>
            <dt className="text-muted">Email confirmed</dt><dd>{profile.confirmed_at ? "Yes" : "No"}</dd>
            <dt className="text-muted">Last sign-in</dt><dd>{date(profile.last_sign_in_at)}</dd>
            <dt className="text-muted">Sign-ins</dt><dd>{profile.sign_in_count}</dd>
          </>
        )}
      </dl>
      <button type="button" className="btn-secondary" onClick={() => supabase().auth.signOut()}>Sign out</button>
    </section>
  );
}

/**
 * Re-translates every saved card of the current learning language into its chosen translation language,
 * 15 cards per AI request. For older cards made in another language (or labelled wrongly).
 */
function RetranslateAll({ language, support, disabled, note }: {
  language: Lang;
  support: SupportLang;
  disabled: boolean;
  note: string | null;
}) {
  const [ids, setIds] = useState<{ id: string; translation_lang: string }[] | null>(null);
  const [asking, setAsking] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  useEffect(() => {
    supabase()
      .from("words")
      .select("id, translation_lang")
      .eq("language", language)
      .then(({ data }) => setIds((data ?? []) as { id: string; translation_lang: string }[]));
  }, [language, progress]);

  if (!ids || ids.length === 0) return null;
  const other = ids.filter((w) => (w.translation_lang ?? "en") !== support).length;
  const name = SUPPORT_LANGUAGES[support];

  async function run(): Promise<string | null> {
    const all = ids!.map((w) => w.id);
    let done = 0;
    let skipped = 0;
    for (let i = 0; i < all.length; i += 15) {
      setProgress(`Translating… ${Math.min(i, all.length)} of ${all.length}`);
      try {
        const res = await api<{ updated: number; skipped: number }>("/api/retranslate", { ids: all.slice(i, i + 15) }, 90_000);
        done += res.updated;
        skipped += res.skipped;
      } catch (err) {
        setAsking(false);
        setProgress(`Stopped after ${done} of ${all.length}: ${(err as Error).message} Run it again later to continue.`);
        return null;
      }
    }
    setAsking(false);
    setProgress(`Done: ${done} cards now have ${name} translations.${skipped ? ` ${skipped} could not be matched; try those on their own page.` : ""}`);
    return null;
  }

  return (
    <div className="mt-1 flex flex-col gap-2 rounded-xl bg-ground px-3.5 py-3">
      <p className="text-sm">
        {other > 0
          ? <><strong>{other}</strong> of your {ids.length} {LANG_INFO[language].name} cards are marked with another translation language.</>
          : <>Translations look mixed up on older cards? Re-translate all {ids.length} {LANG_INFO[language].name} cards into {name}.</>}
      </p>
      <button type="button" className="btn-small self-start" disabled={disabled || asking || progress?.startsWith("Translating")}
        onClick={() => { setProgress(null); setAsking(true); }}>
        Re-translate all into {name}
      </button>
      {note && <p className="text-xs text-muted">{note}</p>}
      {progress && <p role="status" className="text-sm text-soft">{progress}</p>}
      <ConfirmDialog open={asking} onCancel={() => setAsking(false)} onConfirm={run} tone="primary"
        busyLabel="Translating…" confirmLabel="Re-translate"
        title={`Re-translate ${ids.length} cards into ${name}?`}
        body={<>
          The meaning, example sentences and related words on every {LANG_INFO[language].name} card get a new {name} translation.
          Your own notes, drawings and review progress stay. This uses about {Math.ceil(ids.length / 15)} of your daily AI requests.
        </>} />
    </div>
  );
}
