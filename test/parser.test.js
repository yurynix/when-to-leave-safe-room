import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyMessageType,
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
  assert.equal(classifyMessageType(message), "upcoming_warning");
  assert.deepEqual(alertTowns, []);
  assert.equal(matched.size, 0);
});

test("safe-exit update parses towns without timing brackets", () => {
  const message = `🚨 עדכון (28/2/2026) 13:31

ניתן לצאת מהמרחב המוגן אך יש להישאר בקרבתו
באזורים הבאים ניתן לצאת מהמרחב המוגן, אך יש להישאר בקרבתו.

אזור מרכז הנגב
באר שבע - דרום, באר שבע - מזרח, באר שבע - מערב, באר שבע - צפון, עומר`;

  assert.equal(classifyMessageType(message), "safe_exit_update");

  const { matched, alertTowns, messageType } = matchConfiguredTowns(message, ["עומר", "באר שבע"]);
  assert.equal(messageType, "safe_exit_update");
  assert.ok(alertTowns.includes("עומר"));
  assert.ok(alertTowns.includes("באר שבע - דרום"));
  assert.equal(matched.has("עומר"), true);
  assert.equal(matched.has("באר שבע"), true);
});

test("real alert example starts matches for monitored towns", () => {
  const message = `🚨 ירי רקטות וטילים (28/2/2026) 13:10

אזור דרום הנגב
אבו תלול, ואדי אל נעם דרום, כסייפה, מרעית, סעווה, תל ערד (דקה וחצי)

אזור יהודה
חוות אשכולות (דקה)
אביגיל, אזור תעשייה מיתרים, אפקה, אשתמוע, בית חג"י, בית יתיר, הר עמשא, חוות דרומא, חוות טואמין, חוות טליה, חוות יויו, חוות מדבר חבר, חוות מור ואברהם, חוות מלאכי אברהם, חוות מנחם, חוות מקנה יהודה, חירן, טנא עומרים, כרמל, מעון, מעלה חבר, מצפה זי"ו, מצפה יאיר, סוסיא, סוסיא הקדומה, עשהאל, עתניאל, שמעה, שני ליבנה (דקה וחצי)

אזור ים המלח
מצפה מדרג (דקה וחצי)

אזור מרכז הנגב
להב, להבים (45 שניות)
אשכולות, באר שבע - דרום, באר שבע - מזרח, באר שבע - מערב, באר שבע - צפון, חצרים, כרמית, לקיה, סנסנה, עומר (דקה)
אום בטין, אל סייד, חורה, כרמים, מיתר, נבטים, שגב שלום, תל שבע (דקה וחצי)

היכנסו למרחב המוגן.`;

  assert.equal(classifyMessageType(message), "alert");

  const { matched, alertTowns, messageType } = matchConfiguredTowns(message, ["עומר", "באר שבע"]);
  assert.equal(messageType, "alert");
  assert.ok(alertTowns.includes("עומר"));
  assert.ok(alertTowns.includes("באר שבע - דרום"));
  assert.equal(matched.has("עומר"), true);
  assert.equal(matched.has("באר שבע"), true);
  assert.deepEqual(matched.get("באר שבע"), [
    "באר שבע - דרום",
    "באר שבע - מזרח",
    "באר שבע - מערב",
    "באר שבע - צפון",
  ]);
});

test("real safe-exit update example is classified and matched", () => {
  const message = `🚨 עדכון (28/2/2026) 13:31

ניתן לצאת מהמרחב המוגן אך יש להישאר בקרבתו
באזורים הבאים ניתן לצאת מהמרחב המוגן, אך יש להישאר בקרבתו.

אזור מערב הנגב
אופקים, אורים, אזור תעשייה נ.ע.מ, אשבול, אשל הנשיא, בטחה, בית הגדי, ברור חיל, ברוש, גבולות, גילת, דורות, זרועה, יושיביה, מבועים, מסלול, מעגלים, גבעולים, מלילות, ניר משה, ניר עקיבא, נתיבות, פדויים, פטיש, פעמי תש''ז, צאלים, קלחים, קריית חינוך מרחבים, רוחמה, רנן, שבי דרום, שדה צבי, שיבולים, שרשרת, תאשור, תדהר, תלמי ביל''ו, תפרח

אזור עוטף עזה
אבשלום, אור הנר, ארז, בארי, בני נצרים, גבים, מכללת ספיר, גברעם, דקל, זיקים, זמרת, שובה, חולית, חוף זיקים, חניון רעים אנדרטת הנובה, יבול, יד מרדכי, יכיני, יתד, כיסופים, כפר מימון ותושיה, כפר עזה, כרם שלום, כרמיה, מבטחים, עמיעוז, ישע, מגן, מטווח ניר עם, מפלסים, נווה, נחל עוז, ניר יצחק, ניר עוז, ניר עם, נירים, נתיב העשרה, סופה, סעד, עין הבשור, עין השלושה, עלומים, פרי גן, צוחר, אוהד, רעים, שדה ניצן, שדי אברהם, שדרות, איבים, שוקדה, שלומית, תלמי אליהו, תלמי יוסף, תקומה`;

  assert.equal(classifyMessageType(message), "safe_exit_update");

  const { matched, messageType } = matchConfiguredTowns(message, ["אופקים", "שדרות", "עומר"]);
  assert.equal(messageType, "safe_exit_update");
  assert.equal(matched.has("אופקים"), true);
  assert.equal(matched.has("שדרות"), true);
  assert.equal(matched.has("עומר"), false);
});
