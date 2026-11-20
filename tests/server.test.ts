import assert from "node:assert/strict";
import { test } from "node:test";
import { toExamples, toRelated } from "../lib/server/ai-shapes";
import { expressionPrompt, expressionSchema } from "../lib/server/expression";
import { explainError, handle, HttpError, readJson, requireUser } from "../lib/server/http";
import { cleanStory, storyPrompt, type StoryContent } from "../lib/server/story";

/* ---------- Error messages (what the learner sees when something fails) ---------- */

test("explainError turns AI and network failures into clear, specific messages", () => {
  const cases: [unknown, string, number, boolean][] = [
    [{ status: 429, message: "Resource has been exhausted" }, "ai_quota", 429, true],
    [new Error("quota exceeded for metric"), "ai_quota", 429, true],
    [{ status: 400, message: "API key not valid. Please pass a valid API key." }, "ai_key", 500, false],
    [{ status: 403, message: "Permission denied" }, "ai_key", 500, false],
    [{ status: 404, message: "models/x is not found" }, "ai_model", 500, false],
    [{ status: 503, message: "The model is overloaded" }, "ai_busy", 503, true],
    [Object.assign(new Error("aborted"), { name: "AbortError" }), "ai_timeout", 504, true],
    [new Error("fetch failed: ECONNRESET"), "ai_network", 502, true],
    [new SyntaxError("Unexpected token < in JSON"), "ai_bad_answer", 502, true],
    [new Error("Empty answer from Gemini"), "ai_bad_answer", 502, true],
    [new Error("Response was blocked due to safety"), "ai_blocked", 422, false],
    [{ code: "23505", message: "duplicate key value" }, "db", 500, false],
    [new Error("something odd"), "unknown", 500, true],
  ];
  for (const [err, code, status, retry] of cases) {
    const e = explainError(err);
    assert.equal(e.code, code, JSON.stringify(err));
    assert.equal(e.status, status, code);
    assert.equal(e.retry, retry, code);
    assert.ok(e.message.length > 20, "has a real explanation");
    assert.ok(!/something went wrong\. try again\.$/i.test(e.message), "not the old generic text");
  }
});

test("explainError keeps errors the app already explained", () => {
  const mine = new HttpError(422, "Not a Dutch word.", "not_word");
  assert.equal(explainError(mine), mine);
});

test("handle() answers with JSON: the result, or { error, code, retry } and the right status", async () => {
  const ok = await handle(async () => ({ hello: "world" }));
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { hello: "world" });

  const bad = await handle(async () => {
    throw new HttpError(422, "Not a word.", "not_word");
  });
  assert.equal(bad.status, 422);
  assert.deepEqual(await bad.json(), { error: "Not a word.", code: "not_word", retry: false });

  const busy = await handle(async () => {
    throw { status: 503, message: "overloaded" };
  });
  assert.equal(busy.status, 503);
  assert.equal((await busy.json()).code, "ai_busy");
});

test("readJson rejects a body that isn't JSON with a clear 400", async () => {
  await assert.rejects(readJson(new Request("http://x", { method: "POST", body: "not json" })), (e: HttpError) => e.status === 400);
  assert.deepEqual(await readJson(new Request("http://x", { method: "POST", body: '{"a":1}' })), { a: 1 });
});

test("requireUser refuses a request without a login token", async () => {
  await assert.rejects(requireUser(new Request("http://x", { method: "POST" })), (e: HttpError) => e.status === 401 && e.code === "auth");
});

/* ---------- AI answers -> stored fields ---------- */

test("toExamples and toRelated map the AI's neutral names to the stored nl/en fields, dropping empties", () => {
  assert.deepEqual(
    toExamples([
      { sentence: " Ik fiets. ", translation: " I cycle. " },
      { sentence: "", translation: "nothing" },
    ]),
    [{ nl: "Ik fiets.", en: "I cycle." }],
  );
  assert.deepEqual(toExamples(undefined), []);
  assert.deepEqual(toRelated([{ word: "de rijwiel", relation: "synoniem", translation: "bike" }]), [
    { word: "de rijwiel", relation: "synoniem", en: "bike" },
  ]);
});

/* ---------- Prompts ---------- */

test("the expression prompt names the learned language, the level and the translation language", () => {
  const p = expressionPrompt("jemandem die Daumen drücken", "de", "A2", "nl");
  assert.match(p, /German/);
  assert.match(p, /A2/);
  assert.match(p, /Dutch/);
  assert.match(p, /EXACTLY the same/); // no look-alike idioms
  const schema = expressionSchema("de") as { properties: { kind: { enum: string[] }; related: { items: { properties: { relation: { enum: string[] } } } } } };
  assert.deepEqual(schema.properties.kind.enum, ["phrase", "idiom", "saying", "sentence"]);
  assert.deepEqual(schema.properties.related.items.properties.relation.enum, ["Synonym", "Gegenteil", "Wortfamilie"]);
});

test("the story prompt lists every word and fits the length to the level", () => {
  const a1 = storyPrompt(["de fiets", "de afspraak"], "nl", "A1", "en");
  const c1 = storyPrompt(["de fiets", "de afspraak"], "nl", "C1", "ar");
  assert.match(a1, /"de fiets"/);
  assert.match(a1, /"de afspraak"/);
  assert.match(a1, /about 60 words/);
  assert.match(c1, /about 220 words/);
  assert.match(c1, /Arabic/);
});

test("cleanStory drops broken questions and 'used' forms that aren't in the text", () => {
  const s: StoryContent = {
    title: "T",
    text: "Anna heeft een afspraak. Haar fiets is kapot.",
    translation: "…",
    used: ["afspraak", "de fiets", ""],
    questions: [
      { question: "ok", options: ["a", "b", "c"], answer: 1, explanation: "" },
      { question: "answer out of range", options: ["a", "b"], answer: 5, explanation: "" },
      { question: "one option", options: ["a"], answer: 0, explanation: "" },
      { question: "not an index", options: ["a", "b"], answer: 0.5, explanation: "" },
      { question: "ok 2", options: ["a", "b"], answer: 0, explanation: "" },
      { question: "ok 3", options: ["a", "b"], answer: 1, explanation: "" },
      { question: "ok 4 (too many)", options: ["a", "b"], answer: 1, explanation: "" },
    ],
  };
  const c = cleanStory(s);
  assert.deepEqual(c.used, ["afspraak"]);
  assert.deepEqual(c.questions.map((q) => q.question), ["ok", "ok 2", "ok 3"]);
});

/* ---------- Daily AI limit and setup errors ---------- */

test("spendAiQuota lets requests through until the database says the daily limit is reached", async () => {
  const { spendAiQuota } = await import("../lib/server/http");
  const fake = (result: { data: unknown; error: unknown }) => ({ rpc: async () => result }) as never;
  await spendAiQuota(fake({ data: true, error: null }));
  await assert.rejects(spendAiQuota(fake({ data: false, error: null })), (e: HttpError) =>
    e.status === 429 && e.code === "daily_limit" && /resets tomorrow/.test(e.message));
  // If the limit function is missing (schema not updated yet), learning is not blocked.
  await spendAiQuota(fake({ data: null, error: { message: "function use_ai does not exist" } }));
});

test("a server without its settings explains which one is missing", async () => {
  const saved = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, role: process.env.SUPABASE_SERVICE_ROLE_KEY };
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    const { serviceClient } = await import("../lib/server/http");
    assert.throws(() => serviceClient(), (e: HttpError) => e.code === "setup" && /NEXT_PUBLIC_SUPABASE_URL/.test(e.message));
    await assert.rejects(
      requireUser(new Request("http://x", { headers: { Authorization: "Bearer abc" } })),
      (e: HttpError) => e.code === "setup" && e.status === 500,
    );
  } finally {
    if (saved.url) process.env.NEXT_PUBLIC_SUPABASE_URL = saved.url;
    if (saved.role) process.env.SUPABASE_SERVICE_ROLE_KEY = saved.role;
  }
});

test("the AI daily limit can be set with AI_CALLS_PER_DAY", async () => {
  const { spendAiQuota } = await import("../lib/server/http");
  let asked = 0;
  const fake = { rpc: async (_: string, args: { max_calls: number }) => ((asked = args.max_calls), { data: true, error: null }) } as never;
  process.env.AI_CALLS_PER_DAY = "40";
  await spendAiQuota(fake);
  assert.equal(asked, 40);
  process.env.AI_CALLS_PER_DAY = "nonsense";
  await spendAiQuota(fake);
  assert.equal(asked, 150);
  delete process.env.AI_CALLS_PER_DAY;
});
