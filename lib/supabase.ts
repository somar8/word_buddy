"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/** The browser's database client. Row level security limits it to the signed-in user. */
export function supabase(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. See README.");
    }
    client = createClient(url, key);
  }
  return client;
}

/** An error from one of the app's API routes, with a message the learner can act on. */
export class ApiError extends Error {
  constructor(
    message: string,
    public code = "error",
    public retry = false,
    public status = 0,
  ) {
    super(message);
  }
}

/** Short titles for the error box, by error code. */
export const ERROR_TITLES: Record<string, string> = {
  offline: "You're offline",
  network: "Can't reach Word Buddy",
  timeout: "This is taking too long",
  auth: "Signed out",
  not_word: "Not recognised",
  single_word: "That's one word",
  too_few_words: "Add a few more words first",
  daily_limit: "Daily AI limit reached",
  ai_quota: "AI is resting for a minute",
  ai_busy: "AI is busy",
  ai_timeout: "AI took too long",
  ai_network: "AI can't be reached",
  ai_bad_answer: "AI answer couldn't be read",
  ai_blocked: "AI skipped this word",
  ai_key: "AI is not set up",
  ai_model: "AI model unavailable",
  setup: "Server not set up",
  db: "Database problem",
  server: "Server problem",
};

/** Calls one of the app's own API routes as the signed-in user. Throws ApiError. */
export async function api<T>(path: string, body: unknown, timeoutMs = 45_000): Promise<T> {
  const { data } = await supabase().auth.getSession();
  const token = data.session?.access_token;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      throw new ApiError("No answer after 45 seconds. Check your connection and try again.", "timeout", true);
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      throw new ApiError("Your device has no internet connection. Connect to Wi-Fi or mobile data and try again.", "offline", true);
    }
    throw new ApiError("The Word Buddy server didn't answer. Check your connection, then try again.", "network", true);
  } finally {
    clearTimeout(timer);
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    if (json?.error) throw new ApiError(json.error, json.code ?? "error", Boolean(json.retry), res.status);
    throw new ApiError(
      res.status >= 500
        ? `The server had a problem (error ${res.status}). Try again in a moment.`
        : `The request failed (error ${res.status}). Reload the page and try again.`,
      "server",
      res.status >= 500,
      res.status,
    );
  }
  return json as T;
}
