import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";

// The browser client needs these; nothing is contacted (fetch is replaced below).
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:1";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test";

const realFetch = globalThis.fetch;
let online = true;
before(() => {
  Object.defineProperty(globalThis.navigator, "onLine", { get: () => online, configurable: true });
});
after(() => {
  globalThis.fetch = realFetch;
});

function respond(body: string, status: number) {
  globalThis.fetch = (async () => new Response(body, { status, headers: { "content-type": "application/json" } })) as typeof fetch;
}

test("api() returns the JSON of a successful answer", async () => {
  const { api } = await import("../lib/supabase");
  respond('{"card":{"word":"fiets"}}', 200);
  assert.deepEqual(await api("/api/card", { word: "fiets" }), { card: { word: "fiets" } });
});

test("api() passes on the server's explained error, code and retry flag", async () => {
  const { api, ApiError } = await import("../lib/supabase");
  respond('{"error":"Not a Dutch word.","code":"not_word","retry":false}', 422);
  await assert.rejects(api("/api/card", {}), (e: InstanceType<typeof ApiError>) =>
    e instanceof ApiError && e.code === "not_word" && e.status === 422 && !e.retry && e.message === "Not a Dutch word.");
});

test("api() explains a server crash that isn't JSON", async () => {
  const { api } = await import("../lib/supabase");
  respond("<html>Internal Server Error</html>", 500);
  await assert.rejects(api("/api/card", {}), (e: { code: string; retry: boolean; message: string }) =>
    e.code === "server" && e.retry && /error 500/.test(e.message));
});

test("api() tells offline apart from an unreachable server", async () => {
  const { api } = await import("../lib/supabase");
  globalThis.fetch = (async () => {
    throw new TypeError("Failed to fetch");
  }) as typeof fetch;
  online = false;
  await assert.rejects(api("/x", {}), (e: { code: string }) => e.code === "offline");
  online = true;
  await assert.rejects(api("/x", {}), (e: { code: string }) => e.code === "network");
});

test("api() gives up with a clear message when there is no answer in time", async () => {
  const { api } = await import("../lib/supabase");
  globalThis.fetch = ((_: unknown, init?: RequestInit) =>
    new Promise((_r, reject) => init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))))) as typeof fetch;
  await assert.rejects(api("/x", {}, 30), (e: { code: string; retry: boolean }) => e.code === "timeout" && e.retry);
});

test("every error code the server can send has a title in the app", async () => {
  const { ERROR_TITLES } = await import("../lib/supabase");
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(f)) files.push(p);
    }
  };
  walk(fileURLToPath(new URL("../lib/server", import.meta.url)));
  walk(fileURLToPath(new URL("../app/api", import.meta.url)));
  const codes = new Set<string>();
  for (const f of files) {
    for (const m of readFileSync(f, "utf8").matchAll(/new HttpError\(\s*\d+,[\s\S]*?,\s*"([a-z_]+)"\s*(?:,\s*(?:true|false))?\s*,?\s*\)/g)) {
      codes.add(m[1]);
    }
  }
  // Codes that need no special title: plain input problems shown with their message.
  const generic = new Set(["error", "bad_request", "empty", "not_found", "unknown"]);
  const missing = [...codes].filter((c) => !generic.has(c) && !ERROR_TITLES[c]);
  assert.ok(codes.size >= 10, `found ${codes.size} codes`);
  assert.deepEqual(missing, []);
});
