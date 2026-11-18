"use client";

import { useEffect, useRef, useState } from "react";

/**
 * An in-app "Are you sure?" dialog for permanent actions.
 * Uses the native <dialog>, so focus is trapped and Escape cancels.
 */
export default function ConfirmDialog({ open, title, body, confirmLabel, onConfirm, onCancel, tone = "danger", busyLabel = "Deleting…" }: {
  open: boolean;
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => Promise<string | null | void> | void; // return an error message to keep the dialog open
  onCancel: () => void;
  tone?: "danger" | "primary";
  busyLabel?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  async function confirm() {
    setBusy(true);
    setError(null);
    const message = await onConfirm();
    setBusy(false);
    if (message) setError(message);
  }

  return (
    <dialog ref={ref} aria-labelledby="confirm-title"
      onCancel={(e) => { e.preventDefault(); if (!busy) { setError(null); onCancel(); } }}
      className="m-auto w-[min(92vw,400px)] rounded-2xl bg-white p-0 text-ink shadow-xl backdrop:bg-black/40">
      <div className="flex flex-col gap-3 p-5">
        <h2 id="confirm-title" className="font-display text-xl font-bold">{title}</h2>
        <div className="text-[15px] leading-relaxed text-soft">{body}</div>
        {error && <p role="alert" className="rounded-xl bg-due-soft px-3 py-2 text-sm text-due-ink">{error}</p>}
        <div className="mt-1 flex gap-2">
          <button type="button" className="btn-secondary h-11 flex-1" disabled={busy}
            onClick={() => { setError(null); onCancel(); }} autoFocus>
            Cancel
          </button>
          <button type="button" disabled={busy} onClick={confirm}
            className={`inline-flex h-11 flex-1 items-center justify-center rounded-[14px] px-4 text-[15px] font-semibold text-white disabled:opacity-60 ${tone === "danger" ? "bg-[#b42318]" : "bg-accent"}`}>
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
