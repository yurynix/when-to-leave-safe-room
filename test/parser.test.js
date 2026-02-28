import test from "node:test";
import assert from "node:assert/strict";

import {
  extractTownsFromAlert,
  matchConfiguredTowns,
  normalizeTownName,
  shouldIgnoreAlertMessage,
} from "../src/parser.js";

test("normalizeTownName normalizes dash variants and spaces", () => {
  assert.equal(normalizeTownName("באר שבע–דרום"), "באר שבע - דרום");
  assert.equal(normalizeTownName(" באר   שבע  -  מזרח "), "באר שבע - מזרח");
});

test("extractTownsFromAlert parses only town lines", () => {
  const message = `ירי רקטות וטילים (28/2/2026) 11:08

אזור מרכז הנגב
אזור תעשייה עידן הנגב, אתר דודאים, גבעות בר, להב, להבים (45 שניות)
אשכולות, באר שבע - דרום, באר שבע - מזרח, באר שבע - מערב, באר שבע - צפון, עומר (דקה)

היכנסו למרחב המוגן.`;

  const towns = extractTownsFromAlert(message);

  assert.ok(towns.includes("עומר"));
  assert.ok(towns.includes("באר שבע - דרום"));
  assert.ok(!towns.includes("אזור מרכז הנגב"));
  assert.ok(!towns.includes("היכנסו למרחב המוגן."));
  assert.ok(!towns.includes("ירי רקטות וטילים"));
  assert.ok(!towns.includes("🚨 ירי רקטות וטילים"));
});

test("matchConfiguredTowns supports base-city matching", () => {
  const message = `אזור מרכז הנגב
אשכולות, באר שבע - דרום, באר שבע - מזרח, עומר (דקה)`;

  const { matched } = matchConfiguredTowns(message, ["עומר", "באר שבע", "כחל"]);

  assert.equal(matched.has("עומר"), true);
  assert.equal(matched.has("באר שבע"), true);
  assert.equal(matched.has("כחל"), false);

  assert.deepEqual(matched.get("עומר"), ["עומר"]);
  assert.deepEqual(matched.get("באר שבע"), ["באר שבע - דרום", "באר שבע - מזרח"]);
});

test("upcoming-warning bulletin is ignored even if monitored towns appear", () => {
  const message = `🚨 מבזק (28/2/2026) 12:23

בדקות הקרובות צפויות להתקבל התרעות באזורך
על תושבי האזורים הבאים לשפר את המיקום למיגון המיטבי בקרבתך.

אזור מרכז הנגב
אום בטין, באר שבע - דרום, באר שבע - מזרח, באר שבע - מערב, באר שבע - צפון, עומר`;

  assert.equal(shouldIgnoreAlertMessage(message), true);

  const towns = extractTownsFromAlert(message);
  assert.deepEqual(towns, []);

  const { matched, alertTowns } = matchConfiguredTowns(message, ["עומר", "באר שבע"]);
  assert.deepEqual(alertTowns, []);
  assert.equal(matched.size, 0);
});
