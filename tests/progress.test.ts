import assert from "node:assert/strict";
import { test } from "node:test";
import { lastDays, streak } from "../lib/progress";

test("streak counts days in a row, and still counts up to yesterday before you practise today", () => {
  const days = new Set(["2026-11-18", "2026-11-19", "2026-11-20"]);
  assert.equal(streak(days, "2026-11-20"), 3);
  assert.equal(streak(days, "2026-11-21"), 3); // not practised yet today
  assert.equal(streak(days, "2026-11-22"), 0); // missed yesterday
  assert.equal(streak(new Set(["2026-11-20", "2026-11-18"]), "2026-11-20"), 1);
});

test("lastDays lists the last n days, oldest first", () => {
  assert.deepEqual(lastDays("2026-11-20", 3), ["2026-11-18", "2026-11-19", "2026-11-20"]);
});
