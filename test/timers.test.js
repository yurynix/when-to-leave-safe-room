import test from "node:test";
import assert from "node:assert/strict";

import { TownTimerManager } from "../src/timers.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("timer expires and calls callback once", async () => {
  const expired = [];
  const manager = new TownTimerManager({
    durationMs: 30,
    onExpire: async (town) => expired.push(town),
    logger: { info: () => {}, error: () => {} },
  });

  manager.upsert("עומר");
  await sleep(70);

  assert.deepEqual(expired, ["עומר"]);
});

test("upsert resets timer for same town", async () => {
  const expired = [];
  const manager = new TownTimerManager({
    durationMs: 50,
    onExpire: async (town) => expired.push(town),
    logger: { info: () => {}, error: () => {} },
  });

  manager.upsert("באר שבע");
  await sleep(30);
  manager.upsert("באר שבע");
  await sleep(35);

  // Must not expire yet because timer was reset.
  assert.deepEqual(expired, []);

  await sleep(30);
  assert.deepEqual(expired, ["באר שבע"]);
});

test("newer alert for same town prevents false early notification", async () => {
  const expired = [];
  const manager = new TownTimerManager({
    durationMs: 200,
    onExpire: async (town) => expired.push(town),
    logger: { info: () => {}, error: () => {} },
  });

  // First alert is almost expired already (would fire ~10ms after upsert).
  const firstAlertDate = new Date(Date.now() - 190);
  manager.upsert("עומר", ["עומר"], firstAlertDate);

  // A newer alert arrives before the old one can expire -> must reset window.
  await sleep(5);
  const newerAlertDate = new Date();
  manager.upsert("עומר", ["עומר"], newerAlertDate);

  // If reset fails, we'd see a false notification here.
  await sleep(40);
  assert.deepEqual(expired, []);

  // After full new window, one notification is expected.
  await sleep(190);
  assert.deepEqual(expired, ["עומר"]);
});

test("clearAll cancels pending timers", async () => {
  const expired = [];
  const manager = new TownTimerManager({
    durationMs: 40,
    onExpire: async (town) => expired.push(town),
    logger: { info: () => {}, error: () => {} },
  });

  manager.upsert("עומר");
  manager.upsert("באר שבע");
  manager.clearAll();
  await sleep(70);

  assert.deepEqual(expired, []);
});

test("timer uses alert timestamp instead of processing time", async () => {
  const manager = new TownTimerManager({
    durationMs: 120,
    onExpire: async () => {},
    logger: { info: () => {}, error: () => {} },
  });

  // Simulate parsing a message that is older than the full quiet window.
  const oldAlertDate = new Date(Date.now() - 1_000);
  manager.upsert("עומר", ["עומר"], oldAlertDate);

  const tracked = manager.timers.get("עומר");
  assert.ok(tracked);
  assert.equal(tracked.alertAt.getTime(), oldAlertDate.getTime());
  assert.equal(tracked.expiresAt.getTime(), oldAlertDate.getTime() + 120);
  assert.ok(tracked.expiresAt.getTime() <= Date.now());

  manager.clearAll();
});

test("older out-of-order alert does not reset a newer timer", async () => {
  const expired = [];
  const manager = new TownTimerManager({
    durationMs: 90,
    onExpire: async (town) => expired.push(town),
    logger: { info: () => {}, error: () => {} },
  });

  const newerAlert = new Date(Date.now());
  manager.upsert("באר שבע", ["באר שבע - דרום"], newerAlert);

  await sleep(10);
  const olderAlert = new Date(newerAlert.getTime() - 60_000);
  manager.upsert("באר שבע", ["באר שבע - מערב"], olderAlert);

  await sleep(110);
  assert.deepEqual(expired, ["באר שבע"]);
});

test("old alert expires immediately when window already passed", async () => {
  const expired = [];
  const manager = new TownTimerManager({
    durationMs: 120,
    onExpire: async (town) => expired.push(town),
    logger: { info: () => {}, error: () => {} },
  });

  manager.upsert("עומר", ["עומר"], new Date(Date.now() - 1_000));
  await sleep(40);

  assert.deepEqual(expired, ["עומר"]);
});

test("getPendingStatuses returns active timers with remaining time", () => {
  const manager = new TownTimerManager({
    durationMs: 1000,
    onExpire: async () => {},
    logger: { info: () => {}, error: () => {} },
  });

  const baseNow = Date.now();
  const alertDate = new Date(baseNow);
  manager.upsert("עומר", ["עומר"], alertDate);

  const statuses = manager.getPendingStatuses(baseNow + 400);
  assert.equal(statuses.length, 1);
  assert.equal(statuses[0].town, "עומר");
  assert.equal(statuses[0].remainingMs, 600);

  manager.clearAll();
});

test("getPendingStatuses returns empty when no active timers", () => {
  const manager = new TownTimerManager({
    durationMs: 1000,
    onExpire: async () => {},
    logger: { info: () => {}, error: () => {} },
  });

  assert.deepEqual(manager.getPendingStatuses(), []);
});

test("clearTown removes only the requested town timer", () => {
  const manager = new TownTimerManager({
    durationMs: 1000,
    onExpire: async () => {},
    logger: { info: () => {}, error: () => {} },
  });

  manager.upsert("עומר", ["עומר"], new Date());
  manager.upsert("באר שבע", ["באר שבע - דרום"], new Date());

  const removed = manager.clearTown("עומר", "test");
  assert.equal(removed, true);

  const pending = manager.getPendingStatuses();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].town, "באר שבע");

  manager.clearAll();
});
