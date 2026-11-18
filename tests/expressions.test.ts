import assert from "node:assert/strict";
import { test } from "node:test";
import { blankOut, expressionGap, keyPart } from "../lib/practice";
import { taskFor } from "../lib/schedule";

test("keyPart keeps a continuous AI key word, with the expression's own casing", () => {
  assert.equal(keyPart("jemandem die Daumen drücken", "daumen drücken"), "Daumen drücken");
});

test("keyPart falls back to the longest meaningful word when the key skips words", () => {
  assert.equal(keyPart("give someone a hand", "give a hand"), "give");
  assert.equal(keyPart("iemand in de maling nemen", ""), "maling");
});

test("blankOut and expressionGap make a fill-in exercise", () => {
  assert.deepEqual(blankOut("Ik duim voor je!", "duim"), { sentence: "Ik ___ voor je!", answer: "duim" });
  const gap = expressionGap({
    word: "iemand in de maling nemen",
    key_word: "maling",
    examples: [{ nl: "Ze nam me in de maling.", en: "She pulled my leg." }],
  });
  assert.equal(gap?.sentence, "Ze nam me in de ___.");
  assert.equal(gap?.answer, "maling");
  // No example contains it: blank it in the expression itself.
  assert.equal(expressionGap({ word: "op de hoogte", key_word: "hoogte", examples: [] })?.sentence, "op de ___");
});

test("expressions get 'complete the expression' instead of 'type the word with its article'", () => {
  assert.equal(taskFor({ id: "a", stage: 2, kind: "word" }, "2026-11-18"), "type");
  assert.equal(taskFor({ id: "a", stage: 2, kind: "idiom" }, "2026-11-18"), "complete");
  assert.equal(taskFor({ id: "a", stage: 3, kind: "idiom" }, "2026-11-18"), "gap");
});

test("toExpressionKind never returns word and maps odd AI values", async () => {
  const { toExpressionKind } = await import("../lib/types");
  assert.equal(toExpressionKind("idiom"), "idiom");
  assert.equal(toExpressionKind("Idiom"), "idiom");
  assert.equal(toExpressionKind("proverb"), "saying");
  assert.equal(toExpressionKind("Redewendung"), "idiom");
  assert.equal(toExpressionKind(undefined), "phrase");
  assert.equal(toExpressionKind("word"), "phrase");
});
