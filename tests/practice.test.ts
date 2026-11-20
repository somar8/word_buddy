import assert from "node:assert/strict";
import { test } from "node:test";
import { englishOf, gapFromExamples } from "../lib/practice";
import { toLevel } from "../lib/levels";

test("englishOf keeps the first meaning", () => {
  assert.equal(englishOf("appointment; date"), "appointment");
  assert.equal(englishOf("  to walk "), "to walk");
});

test("gapFromExamples blanks the word, also inflected, and keeps punctuation", () => {
  const t = gapFromExamples({
    word: "afspraak",
    examples: [{ nl: "Ik heb morgen twee afspraken.", en: "I have two appointments tomorrow." }],
  });
  assert.deepEqual(t && { s: t.sentence, a: t.answer }, { s: "Ik heb morgen twee ___.", a: "afspraken" });
});

test("gapFromExamples handles phrases and missing words", () => {
  const t = gapFromExamples({
    word: "rekening houden met",
    examples: [{ nl: "Je moet rekening houden met het weer.", en: "" }],
  });
  assert.equal(t?.sentence, "Je moet ___ het weer.");
  assert.equal(gapFromExamples({ word: "fiets", examples: [{ nl: "Ik loop naar huis.", en: "" }] }), null);
});

test("toLevel accepts only CEFR levels", () => {
  assert.equal(toLevel("A2"), "A2");
  assert.equal(toLevel("b1"), null);
  assert.equal(toLevel(undefined), null);
});

test("search matches article + word, translation and accents, any order of terms", async () => {
  const { matchesSearch } = await import("../lib/practice");
  const w = { word: "café", article: "het" as const, meaning_nl: "een plek om koffie te drinken", meaning_en: "coffee shop; bar",
    related: [{ word: "de kroeg", relation: "synoniem", en: "pub" }], note: "Gezien op het station" };
  for (const q of ["het cafe", "CAFÉ", "coffee", "pub", "kroeg", "station", "koffie drinken"]) {
    assert.equal(matchesSearch(w, q), true, q);
  }
  assert.equal(matchesSearch(w, "fiets"), false);
  const de = { word: "Straße", article: "die" as const, meaning_nl: "", meaning_en: "street" };
  assert.equal(matchesSearch(de, "strasse"), true);
  assert.equal(matchesSearch(de, "die STRASSE"), true);
  assert.equal(matchesSearch(w, "   "), true);
});

test("a cached sentence is only reused for today and the card's translation language", async () => {
  const { cachedTask } = await import("../lib/practice");
  const task = { sentence: "Ik ___.", answer: "fiets", en: "I cycle.", distractors: [], lang: "en" };
  assert.equal(cachedTask({ review_task: task, review_task_on: "2026-11-18", translation_lang: "en" }, "2026-11-18"), task);
  assert.equal(cachedTask({ review_task: task, review_task_on: "2026-11-18", translation_lang: "nl" }, "2026-11-18"), null);
  assert.equal(cachedTask({ review_task: task, review_task_on: "2026-11-17", translation_lang: "en" }, "2026-11-18"), null);
  // Tasks stored before languages were tracked count as English.
  const old = { sentence: "x ___", answer: "y", en: "z", distractors: [] };
  assert.equal(cachedTask({ review_task: old, review_task_on: "2026-11-18", translation_lang: "ar" }, "2026-11-18"), null);
});

test("closeEnough forgives one slip, capitals and accents, but not another word", async () => {
  const { closeEnough } = await import("../lib/practice");
  assert.equal(closeEnough("fiest", "fiets"), true);
  assert.equal(closeEnough("De Straße", "die strasse"), false); // wrong article is a different word group
  assert.equal(closeEnough("strasse", "Straße"), true);
  assert.equal(closeEnough("cafe", "café"), true);
  assert.equal(closeEnough("fles", "fiets"), false);
  assert.equal(closeEnough("op", "of"), false); // short words must be exact
  assert.equal(closeEnough("jemandem die daumen drucken", "jemandem die Daumen drücken"), true);
});

test("search ranks the word itself above matches in its meaning", async () => {
  const { searchRank } = await import("../lib/practice");
  assert.equal(searchRank({ word: "fiets" }, "fiets"), 0);
  assert.equal(searchRank({ word: "fietsen" }, "fiets"), 1);
  assert.equal(searchRank({ word: "racefiets" }, "fiets"), 2);
  assert.equal(searchRank({ word: "auto" }, "fiets"), 3);
  assert.equal(searchRank({ word: "auto" }, ""), 0);
});

test("editDistance counts additions, removals, changes and swaps as one each", async () => {
  const { editDistance } = await import("../lib/practice");
  assert.equal(editDistance("fiets", "fiets"), 0);
  assert.equal(editDistance("fiets", "fiet"), 1);
  assert.equal(editDistance("fiets", "fietsen"), 2);
  assert.equal(editDistance("fiets", "fiest"), 1);
  assert.equal(editDistance("", "abc"), 3);
});

test("expression gaps use the AI key part, or the longest meaningful word", async () => {
  const { expressionGap, keyPart } = await import("../lib/practice");
  assert.equal(keyPart("to pull someone's leg", ""), "pull");
  // Only short or placeholder words: nothing sensible to hide, so no gap exercise.
  assert.equal(keyPart("op de", ""), "");
  assert.equal(expressionGap({ word: "op de", key_word: "", examples: [] }), null);
});
