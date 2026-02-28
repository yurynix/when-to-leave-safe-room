import test from "node:test";
import assert from "node:assert/strict";

import { loadConfig } from "../src/config.js";

const originalEnv = { ...process.env };

function resetEnv() {
  process.env = { ...originalEnv };
}

function applyBaseEnv() {
  process.env.TELEGRAM_API_ID = "12345";
  process.env.TELEGRAM_API_HASH = "hash";
  process.env.SOURCE_CHANNEL = "@homefront";
  process.env.TARGET_CHAT_ID = "777000";
  delete process.env.TARGET_CHAT_IDS;
  process.env.MONITORED_TOWNS = "עומר, באר שבע";
  delete process.env.FETCH_PAST_ALERTS_ON_START;
  delete process.env.PAST_ALERTS_MINUTES;
}

test("loadConfig parses required fields and defaults", () => {
  resetEnv();
  applyBaseEnv();
  delete process.env.TIMER_MINUTES;
  delete process.env.TELEGRAM_SESSION_STRING;
  delete process.env.TELEGRAM_PHONE;

  const config = loadConfig();

  assert.equal(config.telegramApiId, 12345);
  assert.equal(config.telegramApiHash, "hash");
  assert.equal(config.sourceChannel, "@homefront");
  assert.deepEqual(config.targetChatIds, ["777000"]);
  assert.deepEqual(config.monitoredTowns, ["עומר", "באר שבע"]);
  assert.equal(config.telegramHealthcheckIntervalSeconds, 30);
  assert.equal(config.timerMinutes, 10);
  assert.equal(config.fetchPastAlertsOnStart, false);
  assert.equal(config.pastAlertsMinutes, 10);
});

test("loadConfig prefers TARGET_CHAT_IDS list", () => {
  resetEnv();
  applyBaseEnv();
  process.env.TARGET_CHAT_IDS = "111, 222,333";

  const config = loadConfig();
  assert.deepEqual(config.targetChatIds, ["111", "222", "333"]);
});

test("loadConfig throws when required var is missing", () => {
  resetEnv();
  applyBaseEnv();
  delete process.env.SOURCE_CHANNEL;

  assert.throws(() => loadConfig(), /Missing required environment variable: SOURCE_CHANNEL/);
});

test("loadConfig validates positive timer minutes", () => {
  resetEnv();
  applyBaseEnv();
  process.env.TIMER_MINUTES = "0";

  assert.throws(() => loadConfig(), /TIMER_MINUTES must be a positive integer/);
});

test("loadConfig defaults past-alert minutes to timer minutes", () => {
  resetEnv();
  applyBaseEnv();
  process.env.TIMER_MINUTES = "12";
  process.env.FETCH_PAST_ALERTS_ON_START = "true";
  delete process.env.PAST_ALERTS_MINUTES;

  const config = loadConfig();
  assert.equal(config.fetchPastAlertsOnStart, true);
  assert.equal(config.pastAlertsMinutes, 12);
});

test("loadConfig parses explicit past-alert minutes and boolean flags", () => {
  resetEnv();
  applyBaseEnv();
  process.env.FETCH_PAST_ALERTS_ON_START = "yes";
  process.env.PAST_ALERTS_MINUTES = "3";

  const config = loadConfig();
  assert.equal(config.fetchPastAlertsOnStart, true);
  assert.equal(config.pastAlertsMinutes, 3);
});

test("loadConfig validates boolean replay flag", () => {
  resetEnv();
  applyBaseEnv();
  process.env.FETCH_PAST_ALERTS_ON_START = "maybe";

  assert.throws(() => loadConfig(), /FETCH_PAST_ALERTS_ON_START must be a boolean/);
});

test("loadConfig throws when no target chat config is provided", () => {
  resetEnv();
  applyBaseEnv();
  delete process.env.TARGET_CHAT_ID;
  delete process.env.TARGET_CHAT_IDS;

  assert.throws(
    () => loadConfig(),
    /Missing target chat configuration: set TARGET_CHAT_IDS \(preferred\) or TARGET_CHAT_ID/,
  );
});

test("loadConfig validates positive telegram health-check interval", () => {
  resetEnv();
  applyBaseEnv();
  process.env.TELEGRAM_HEALTHCHECK_INTERVAL_SECONDS = "0";

  assert.throws(
    () => loadConfig(),
    /TELEGRAM_HEALTHCHECK_INTERVAL_SECONDS must be a positive integer/,
  );
});
