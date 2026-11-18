import assert from "node:assert/strict";
import { test } from "node:test";
import { metaFor, prefsFrom, withLanguage, withSupport } from "../lib/prefs";

test("each learning language keeps its own translation language", () => {
  const p = prefsFrom({ language: "de", levels: { de: "A2", en: "B2" }, translations: { de: "nl", en: "ar" } });
  assert.equal(p.support, "nl");
  assert.equal(withLanguage(p, "en").support, "ar");
  // A language without a saved choice gets the default (English, or Dutch when learning English).
  assert.equal(withLanguage(p, "nl").support, "en");
});

test("changing the translation only changes it for the current language", () => {
  const p = prefsFrom({ language: "de", translations: { de: "nl", en: "ar" } });
  const changed = withSupport(p, "fr");
  assert.deepEqual(changed.supports, { de: "fr", en: "ar" });
  const back = prefsFrom(metaFor(withLanguage(changed, "en")));
  assert.equal(back.support, "ar");
  assert.equal(withLanguage(back, "de").support, "fr");
});

test("older accounts keep their single translate_to for the language they learn", () => {
  const p = prefsFrom({ level: "B1", translate_to: "ar" });
  assert.equal(p.language, "nl");
  assert.equal(p.level, "B1");
  assert.equal(p.support, "ar");
  assert.equal(withLanguage(p, "de").support, "en");
});

test("a language is never translated into itself", () => {
  const p = prefsFrom({ language: "en", translations: { en: "en" }, translate_to: "en" });
  assert.equal(p.support, "nl");
  assert.equal(metaFor(p).translate_to, "nl");
});
