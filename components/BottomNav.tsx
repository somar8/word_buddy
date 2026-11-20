"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDueCount } from "@/lib/useDueCount";

export default function BottomNav() {
  const path = usePathname();
  const due = useDueCount();
  const items = [
    { href: "/add", label: "Add", icon: <><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></> },
    { href: "/review", label: "Review", icon: <><rect x="3" y="6" width="14" height="14" rx="2" /><path d="M7 3h12a2 2 0 0 1 2 2v12" /></> },
    { href: "/test", label: "Test", icon: <><path d="M9 11l2 2 4-4" /><rect x="4" y="3" width="16" height="18" rx="2" /></> },
    { href: "/progress", label: "Progress", icon: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></> },
    { href: "/words", label: "My list", icon: <><path d="M8 6h13M8 12h13M8 18h13" /><circle cx="4" cy="6" r="1" /><circle cx="4" cy="12" r="1" /><circle cx="4" cy="18" r="1" /></> },
  ];

  return (
    <nav aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-[#e3e5ea] bg-white pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto grid h-[72px] max-w-md grid-cols-5">
        {items.map((it) => {
          const active = path.startsWith(it.href);
          return (
            <Link key={it.href} href={it.href} aria-current={active ? "page" : undefined}
              className={`relative flex flex-col items-center justify-center gap-1 text-xs ${active ? "font-semibold text-accent" : "font-medium text-soft"}`}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{it.icon}</svg>
              {it.label}
              {it.href === "/review" && due > 0 && (
                <span className="absolute left-[calc(50%+8px)] top-2.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-due px-1.5 text-[11px] font-bold text-ink">
                  <span className="sr-only">, due: </span>{due}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
