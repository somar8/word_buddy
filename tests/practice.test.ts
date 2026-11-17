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
