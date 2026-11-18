"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { usePrefs } from "@/components/AppShell";
import { MAX_REVIEWS_PER_DAY } from "./config";
import { todayLocal } from "./schedule";
import { supabase } from "./supabase";

/** Number of words due today (capped at the daily limit), refreshed on every page change. */
export function useDueCount(): number {
  const path = usePathname();
  const { language } = usePrefs();
  const [count, setCount] = useState(0);

  useEffect(() => {
    let alive = true;
    supabase()
      .from("words")
      .select("id", { count: "exact", head: true })
      .eq("language", language)
      .lte("due_on", todayLocal())
      .then(({ count: c }) => {
        if (alive) setCount(Math.min(c ?? 0, MAX_REVIEWS_PER_DAY));
      });
    return () => {
      alive = false;
    };
  }, [path, language]);

  return count;
}
