import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays, dueLabel, firstDueDate, nextState, normalize, stableShuffle, statusOf, taskFor } from "../lib/schedule";

test("first review is tomorrow, extra groups of 10 wait longer", () => {
  assert.equal(firstDueDate("2026-11-17", 0), "2026-11-18");
  assert.equal(firstDueDate("2026-11-17", 9), "2026-11-18");
  assert.equal(firstDueDate("2026-11-17", 10), "2026-11-19");
});

test("'Good' every time follows days 1, 3, 7, 14, 30, 60 after adding, then learned", () => {
  const added = "2026-01-01";
  let day = addDays(added, 1);
  let stage = 1;
  const reviewDays: string[] = [day];
  for (let i = 0; i < 5; i++) {
    const n = nextState(stage, "good", day);
    stage = n.stage;
    day = n.due_on;
    reviewDays.push(day);
  }
  assert.deepEqual(reviewDays, ["2026-01-02", "2026-01-04", "2026-01-08", "2026-01-15", "2026-01-31", "2026-03-02"]);
  assert.deepEqual(nextState(6, "good", day), { stage: 7, due_on: addDays(day, 90) });
});

test("'Again' goes two reviews back (not to the start) and comes back tomorrow", () => {
  assert.deepEqual(nextState(5, "again", "2026-11-17"), { stage: 3, due_on: "2026-11-18" });
  assert.deepEqual(nextState(2, "again", "2026-11-17"), { stage: 1, due_on: "2026-11-18" });
  assert.deepEqual(nextState(7, "again", "2026-11-17"), { stage: 5, due_on: "2026-11-18" });
});

test("'Hard' repeats the review after half the gap; 'Easy' skips one", () => {
  // Review 4 normally waits 16 days (day 14 -> 30).
  assert.deepEqual(nextState(4, "hard", "2026-11-17"), { stage: 4, due_on: addDays("2026-11-17", 8) });
  assert.deepEqual(nextState(1, "hard", "2026-11-17"), { stage: 1, due_on: "2026-11-18" });
  // Review 2 -> skip review 3: gaps 4 + 7 days.
  assert.deepEqual(nextState(2, "easy", "2026-11-17"), { stage: 4, due_on: addDays("2026-11-17", 11) });
  assert.deepEqual(nextState(6, "easy", "2026-11-17"), { stage: 7, due_on: addDays("2026-11-17", 90) });
  assert.deepEqual(nextState(7, "easy", "2026-11-17"), { stage: 7, due_on: addDays("2026-11-17", 180) });
  assert.deepEqual(nextState(7, "hard", "2026-11-17"), { stage: 7, due_on: addDays("2026-11-17", 30) });
});

test("tasks get harder per review and mix in listening and speaking", () => {
  const ids = Array.from({ length: 40 }, (_, i) => `w${i}`);
  const at = (stage: number) => new Set(ids.map((id) => taskFor({ id, stage }, "2026-11-17")));
  assert.deepEqual([...at(1)], ["meaning"]);
  assert.deepEqual([...at(2)].sort(), ["listen", "recall", "type"]);
  assert.deepEqual([...at(3)].sort(), ["gap", "listen"]);
  assert.deepEqual([...at(4)].sort(), ["choose", "say"]);
  assert.deepEqual([...at(5)], ["write"]);
  assert.ok(at(6).size >= 5);
  // Same word, same day: same exercise.
  assert.equal(taskFor({ id: "x", stage: 2 }, "2026-11-17"), taskFor({ id: "x", stage: 2 }, "2026-11-17"));
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

test("dates: adding days crosses months and years; due labels read naturally", async () => {
  const { daysBetween, todayIn } = await import("../lib/schedule");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2028-02-28", 1), "2028-02-29"); // leap year
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(daysBetween("2026-11-17", "2027-01-16"), 60);
  assert.match(todayIn("Europe/Amsterdam"), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(dueLabel("2026-11-10", "2026-11-17"), "Today"); // overdue still shows as today
  assert.equal(dueLabel("2026-11-17", "2026-11-17"), "Today");
  assert.equal(dueLabel("2026-11-27", "2026-11-17"), "In 10 days");
  assert.equal(dueLabel("2027-02-15", "2026-11-17"), "In 3 months");
});

test("every stage and rating gives a valid stage and a future date; Again never moves a word forward", async () => {
  const { nextState } = await import("../lib/schedule");
  const today = "2026-11-17";
  for (const stage of [1, 2, 3, 4, 5, 6, 7]) {
    const days: Record<string, number> = {};
    for (const r of ["again", "hard", "good", "easy"] as const) {
      const n = nextState(stage, r, today);
      assert.ok(n.stage >= 1 && n.stage <= 7, `${stage}/${r} stage ${n.stage}`);
      assert.ok(n.due_on > today, `${stage}/${r} is in the future`);
      days[r] = Date.parse(n.due_on);
    }
    assert.ok(nextState(stage, "again", today).stage <= stage);
    assert.ok(days.again <= days.hard && days.hard <= days.good && days.good <= days.easy, `stage ${stage}: easier means later`);
  }
});

test("labels, article handling and which exercises need AI or sound", async () => {
  const { AUDIO_FALLBACK, fullWord, needsAiTask, stageLabel } = await import("../lib/schedule");
  assert.equal(stageLabel(3), "Review 3 of 6");
  assert.equal(stageLabel(7), "Learned");
  assert.equal(fullWord({ article: "het", word: "huis" }), "het huis");
  assert.equal(fullWord({ article: "", word: "lopen" }), "lopen");
  assert.equal(normalize("“Het huis!”"), "het huis");
  assert.deepEqual(["gap", "choose", "type", "listen"].map((t) => needsAiTask(t as never)), [true, true, false, false]);
  assert.deepEqual(AUDIO_FALLBACK, { listen: "type", say: "recall" });
});
