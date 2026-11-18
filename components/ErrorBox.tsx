"use client";

import Link from "next/link";
import { ApiError, ERROR_TITLES } from "@/lib/supabase";

/** A clear error message: what happened, and what to do next. */
export default function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const e = error instanceof ApiError ? error : null;
  const code = e?.code ?? "error";
  const title = ERROR_TITLES[code] ?? "That didn't work";
  const text = error instanceof Error ? error.message : String(error);
  const settings = code === "not_word" || code === "daily_limit";
  return (
    <div role="alert" className="flex flex-col gap-2 rounded-2xl border border-[#f3c9a8] bg-due-soft px-4 py-3.5 text-due-ink">
      <div className="flex items-start gap-2.5">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-0.5 shrink-0">
          <circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" />
        </svg>
        <div className="flex flex-col gap-0.5">
          <strong className="text-[15px]">{title}</strong>
          <span className="text-sm leading-snug">{text}</span>
        </div>
      </div>
      {(onRetry && (e?.retry ?? true)) || settings ? (
        <div className="flex gap-2 pl-[30px]">
          {onRetry && (e?.retry ?? true) && (
            <button type="button" onClick={onRetry}
              className="h-9 rounded-lg bg-due-ink px-3.5 text-sm font-semibold text-white">Try again</button>
          )}
          {settings && (
            <Link href="/settings#preferences"
              className="flex h-9 items-center rounded-lg border border-current px-3.5 text-sm font-semibold">Settings</Link>
          )}
        </div>
      ) : null}
    </div>
  );
}
