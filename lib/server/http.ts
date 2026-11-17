import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new HttpError(500, `Server is missing ${name}. See README.`);
  return value;
}

/**
 * Checks the Supabase access token sent by the app and returns a database client
 * that acts as that user, so row level security applies.
 */
export async function requireUser(
  req: Request,
): Promise<{ user: User; supabase: SupabaseClient }> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "Please sign in again.");

  const supabase = createClient(
    env("NEXT_PUBLIC_SUPABASE_URL"),
    env("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "Please sign in again.");

  // Only the people listed in ALLOWED_EMAILS may use the AI (it runs on your key).
  const allowed = (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const email = data.user.email?.toLowerCase() ?? "";
  if (allowed.length > 0 && !allowed.includes(email)) {
    throw new HttpError(403, "This account is not allowed to use Word Buddy.");
  }
  return { user: data.user, supabase };
}

/** A database client with full access, for the daily reminder job only. */
export function serviceClient(): SupabaseClient {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Runs a route handler and turns errors into JSON responses. */
export async function handle(fn: () => Promise<unknown>): Promise<Response> {
  try {
    return Response.json(await fn());
  } catch (err) {
    if (err instanceof HttpError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    console.error(err);
    const message = err instanceof Error ? err.message : "Something went wrong.";
    const quota = /quota|429|rate/i.test(message);
    return Response.json(
      {
        error: quota
          ? "The free AI limit is reached for now. Try again in a minute."
          : "Something went wrong. Try again.",
      },
      { status: quota ? 429 : 500 },
    );
  }
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "Invalid request.");
  }
}
