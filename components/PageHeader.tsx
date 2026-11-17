"use client";

import Link from "next/link";
import { useLevel } from "./AppShell";

export default function PageHeader({ title, right }: { title?: string; right?: React.ReactNode }) {
  const level = useLevel();
  return (
    <header className="flex items-center justify-between px-5 pb-2 pt-[calc(20px+env(safe-area-inset-top))]">
      <span className="font-display text-lg font-bold">{title ?? "Word Buddy"}</span>
      <div className="flex items-center gap-2">
        {right}
        <Link href="/settings#level" aria-label={`Dutch, level ${level}. Change level`}
          className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent-dark">Dutch · {level}</Link>
        <Link href="/settings" aria-label="Settings"
          className="flex h-11 w-11 items-center justify-center rounded-full text-soft">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
          </svg>
        </Link>
      </div>
    </header>
  );
}
