import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays, dueLabel, firstDueDate, nextState, normalize, stableShuffle, statusOf, taskFor } from "../lib/schedule";

test("first review is tomorrow, extra groups of 10 wait longer", () => {
  assert.equal(firstDueDate("2026-11-17", 0), "2026-11-18");
  assert.equal(firstDueDate("2026-11-17", 9), "2026-11-18");
  assert.equal(firstDueDate("2026-11-17", 10), "2026-11-19");
});

test("correct answers follow days 1, 3, 7, 14, 30, 60 after adding", () => {
  const added = "2026-01-01";
  let day = addDays(added, 1);
  let stage = 1;
  const reviewDays: string[] = [day];
  for (let i = 0; i < 5; i++) {
    const n = nextState(stage, true, day);
    stage = n.stage;
    day = n.due_on;
    reviewDays.push(day);
  }
  assert.deepEqual(reviewDays, ["2026-01-02", "2026-01-04", "2026-01-08", "2026-01-15", "2026-01-31", "2026-03-02"]);
  assert.deepEqual(nextState(6, true, day), { stage: 7, due_on: addDays(day, 90) });
});

test("a wrong answer goes back to review 1 tomorrow", () => {
  assert.deepEqual(nextState(5, false, "2026-11-17"), { stage: 1, due_on: "2026-11-18" });
  assert.deepEqual(nextState(7, false, "2026-11-17"), { stage: 1, due_on: "2026-11-18" });
});

test("tasks get harder per review", () => {
  assert.equal(taskFor({ id: "x", stage: 1 }, "2026-11-17"), "meaning");
  assert.equal(taskFor({ id: "x", stage: 2 }, "2026-11-17"), "type");
  assert.equal(taskFor({ id: "x", stage: 3 }, "2026-11-17"), "gap");
  assert.equal(taskFor({ id: "x", stage: 4 }, "2026-11-17"), "choose");
  assert.equal(taskFor({ id: "x", stage: 5 }, "2026-11-17"), "write");
  assert.ok(["meaning", "type", "gap", "choose"].includes(taskFor({ id: "x", stage: 6 }, "2026-11-17")));
});

test("helpers", () => {
  assert.equal(normalize("  De Afspraak. "), "de afspraak");
  assert.equal(statusOf({ stage: 7, due_on: "2027-01-01" }, "2026-11-17"), "learned");
  assert.equal(statusOf({ stage: 7, due_on: "2026-11-17" }, "2026-11-17"), "due");
  assert.equal(statusOf({ stage: 2, due_on: "2026-11-20" }, "2026-11-17"), "learning");
  assert.equal(dueLabel("2026-11-18", "2026-11-17"), "Tomorrow");
  assert.deepEqual(stableShuffle([1, 2, 3], "a"), stableShuffle([1, 2, 3], "a"));
  assert.deepEqual([...stableShuffle([1, 2, 3], "seed")].sort(), [1, 2, 3]);
});
