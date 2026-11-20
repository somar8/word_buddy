import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { defaultSupport, LANG_INFO, LANGUAGES, SUPPORT_LANGUAGES, toLang, toSupport } from "../lib/languages";
import { englishFirst, exampleCount, LEVEL_INFO, LEVELS, toLevel } from "../lib/levels";
import { DAILY_GOALS, metaFor, prefsFrom, supportLabel, translationFirst } from "../lib/prefs";

const schema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");

test("every language has complete labels, a voice and articles the database accepts", () => {
  const dbArticles = schema.match(/check \(article in \(([^)]*)\)\)/)![1].split(",").map((a) => a.trim().replace(/'/g, ""));
  for (const l of LANGUAGES) {
    const info = LANG_INFO[l];
    assert.match(info.speech, /^[a-z]{2}-[A-Z]{2}$/, `${l} voice tag`);
    for (const a of info.articles) assert.ok(dbArticles.includes(a), `${l} article "${a}" is allowed by the DB`);
    for (const [k, v] of Object.entries(info.labels)) assert.ok(v.trim(), `${l} label ${k}`);
    assert.equal(info.relations.length, 3);
    assert.ok(info.partsOfSpeech.length >= 6);
    assert.ok(info.placeholder.length < 25, `${l} placeholder fits the input`);
    assert.ok(info.exprPlaceholder.length < 40);
  }
  // The database allows exactly the languages the app offers.
  const dbLangs = schema.match(/language in \(([^)]*)\)/)![1].split(",").map((a) => a.trim().replace(/'/g, ""));
  assert.deepEqual([...dbLangs].sort(), [...LANGUAGES].sort());
});

test("language helpers accept only known codes", () => {
  assert.equal(toLang("de"), "de");
  assert.equal(toLang("fr"), null);
  assert.equal(toSupport("ar"), "ar");
  assert.equal(toSupport("xx"), null);
  assert.equal(defaultSupport("en"), "nl");
  assert.equal(defaultSupport("de"), "en");
  assert.ok(Object.keys(SUPPORT_LANGUAGES).length >= 9);
});

test("levels: every level has a description and prompt; beginners see translations first", () => {
  for (const l of LEVELS) {
    assert.ok(LEVEL_INFO[l].name && LEVEL_INFO[l].can && LEVEL_INFO[l].prompt.length > 40, l);
  }
  assert.equal(toLevel("C2"), "C2");
  assert.equal(toLevel("D1"), null);
  assert.deepEqual(LEVELS.map(englishFirst), [true, true, false, false, false, false]);
  assert.deepEqual(LEVELS.map(exampleCount), [2, 2, 3, 3, 3, 3]);
});

test("prefsFrom fills safe defaults for a brand-new or broken account", () => {
  const p = prefsFrom(undefined);
  assert.deepEqual(
    { language: p.language, level: p.level, support: p.support, show: p.showTranslation, speech: p.speech, goal: p.dailyGoal },
    { language: "nl", level: null, support: "en", show: "auto", speech: "normal", goal: 15 },
  );
  const odd = prefsFrom({ language: "xx", levels: { nl: "Z9" }, show_translation: "sometimes", speech: "fast", daily_goal: 7 });
  assert.equal(odd.language, "nl");
  assert.equal(odd.level, null);
  assert.equal(odd.showTranslation, "auto");
  assert.equal(odd.speech, "normal");
  assert.equal(odd.dailyGoal, 15);
});

test("metaFor -> prefsFrom keeps every preference", () => {
  const p = prefsFrom({
    language: "de", levels: { de: "B2", nl: "A2" }, translations: { de: "nl", nl: "ar" },
    show_translation: "tap", speech: "slow", daily_goal: 30,
  });
  const back = prefsFrom(metaFor(p));
  assert.deepEqual(back, p);
  assert.equal(metaFor(p).level, "B2"); // mirrored for the profiles table
  assert.equal(metaFor(p).translate_to, "nl");
  assert.ok((DAILY_GOALS as readonly number[]).includes(back.dailyGoal));
});

test("translationFirst follows the setting, and the level when on Auto", () => {
  assert.equal(translationFirst({ showTranslation: "always", level: "C1" }), true);
  assert.equal(translationFirst({ showTranslation: "tap", level: "A1" }), false);
  assert.equal(translationFirst({ showTranslation: "auto", level: "A2" }), true);
  assert.equal(translationFirst({ showTranslation: "auto", level: "B1" }), false);
  assert.equal(translationFirst({ showTranslation: "auto", level: null }), false);
});

test("supportLabel names a translation language, defaulting to English", () => {
  assert.equal(supportLabel("ar"), "Arabic");
  assert.equal(supportLabel(null), "English");
  assert.equal(supportLabel("zz"), "English");
});
