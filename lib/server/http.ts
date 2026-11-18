import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { Lang } from "@/lib/languages";
import { DEFAULT_LEVEL, type Level } from "@/lib/levels";
import { prefsFrom, type Prefs } from "@/lib/prefs";

/**
 * An error with a message the learner can act on.
 * `code` lets the app pick a title; `retry` says whether trying again can help.
 */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "error",
    public retry = false,
  ) {
    super(message);
  }
}

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new HttpError(500, `The server is not set up yet: ${name} is missing. See the README.`, "setup");
  return value;
}

/** How many AI requests (cards, sentences, checks) one account may make per day. */
function aiCallsPerDay(): number {
  const n = Number(process.env.AI_CALLS_PER_DAY);
  return Number.isFinite(n) && n > 0 ? n : 150;
}

/**
 * Checks the Supabase access token sent by the app and returns a database client
 * that acts as that user, so row level security applies.
 */
export async function requireUser(req: Request): Promise<{
  user: User;
  supabase: SupabaseClient;
  prefs: Prefs;
  level: Level;
  lang: Lang;
}> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "You were signed out. Sign in again.", "auth");

  const supabase = createClient(
    env("NEXT_PUBLIC_SUPABASE_URL"),
    env("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "You were signed out. Sign in again.", "auth");

  const prefs = prefsFrom(data.user.user_metadata);
  return { user: data.user, supabase, prefs, level: prefs.level ?? DEFAULT_LEVEL, lang: prefs.language };
}

/** Counts one AI request for this user today and stops them above the daily limit. */
export async function spendAiQuota(supabase: SupabaseClient): Promise<void> {
  const { data, error } = await supabase.rpc("use_ai", { max_calls: aiCallsPerDay() });
  if (error) {
    // The function is missing until supabase/schema.sql is run again; don't block learning for that.
    console.warn("use_ai failed:", error.message);
    return;
  }
  if (data === false) {
    throw new HttpError(
      429,
      `You reached today's limit of ${aiCallsPerDay()} AI requests. It resets tomorrow — your saved words still work.`,
      "daily_limit",
    );
  }
}

/** A database client with full access, for the daily reminder job only. */
export function serviceClient(): SupabaseClient {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Turns errors from Gemini, the network or our own code into a clear message. */
export function explainError(err: unknown): HttpError {
  if (err instanceof HttpError) return err;
  const e = err as { status?: number; name?: string; message?: string; code?: string };
  const message = e?.message ?? String(err);
  const status = typeof e?.status === "number" ? e.status : 0;

  if (status === 429 || /quota|rate.?limit|resource.?exhausted/i.test(message)) {
    return new HttpError(429, "The free AI limit is used up for the moment. Wait a minute and try again.", "ai_quota", true);
  }
  if (/api key not valid|api_key_invalid|permission denied|unauthenticated/i.test(message) || status === 401 || status === 403) {
    return new HttpError(500, "The AI key is not valid. Check GEMINI_API_KEY in the server settings.", "ai_key");
  }
  if (status === 404 || /not found|is not supported/i.test(message)) {
    return new HttpError(500, "The AI model is not available. Set GEMINI_MODEL to a current free model.", "ai_model");
  }
  if (status >= 500 || /overloaded|unavailable|internal error/i.test(message)) {
    return new HttpError(503, "The AI service is busy right now. Try again in a minute.", "ai_busy", true);
  }
  if (e?.name === "AbortError" || /timed? ?out|deadline/i.test(message)) {
    return new HttpError(504, "The AI took too long to answer. Try again.", "ai_timeout", true);
  }
  if (/fetch failed|ENOTFOUND|ECONNRESET|ECONNREFUSED|network/i.test(message)) {
    return new HttpError(502, "The server could not reach the AI service. Try again in a moment.", "ai_network", true);
  }
  if (e?.name === "SyntaxError" || /empty answer|unexpected token|json/i.test(message)) {
    return new HttpError(502, "The AI sent back an answer the app couldn't read. Try again.", "ai_bad_answer", true);
  }
  if (/safety|blocked/i.test(message)) {
    return new HttpError(422, "The AI would not write about this word. Try another word or spelling.", "ai_blocked");
  }
  if (e?.code && /^[0-9A-Z]{5}$/.test(e.code)) {
    // Postgres error from Supabase.
    return new HttpError(500, `The database refused the request (${message}). If you just updated the app, run supabase/schema.sql again.`, "db");
  }
  return new HttpError(500, "Something unexpected went wrong on the server. Try again; if it keeps happening, check the server log.", "unknown", true);
}

/** Runs a route handler and turns errors into JSON responses: { error, code, retry }. */
export async function handle(fn: () => Promise<unknown>): Promise<Response> {
  try {
    return Response.json(await fn());
  } catch (err) {
    const e = explainError(err);
    if (!(err instanceof HttpError)) console.error(err);
    return Response.json({ error: e.message, code: e.code, retry: e.retry }, { status: e.status });
  }
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "The app sent a request the server couldn't read. Reload the page and try again.", "bad_request");
  }
}
