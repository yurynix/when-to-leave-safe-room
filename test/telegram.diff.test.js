import test from "node:test";
import assert from "node:assert/strict";

import {
  coerceInt,
  extractDiffState,
  DEFAULT_DIFF_INTERVAL_S,
} from "../src/telegram.js";

// ---------------------------------------------------------------------------
// coerceInt
// ---------------------------------------------------------------------------

test("coerceInt handles plain numbers", () => {
  assert.equal(coerceInt(42), 42);
  assert.equal(coerceInt(0), 0);
  assert.equal(coerceInt(-100), -100);
});

test("coerceInt handles bigint", () => {
  assert.equal(coerceInt(BigInt(21843)), 21843);
  assert.equal(coerceInt(BigInt(0)), 0);
});

test("coerceInt handles BigInteger-like objects (GramJS)", () => {
  // GramJS BigInteger has valueOf() returning a number-like value.
  const bigIntObj = { valueOf: () => 21843, toString: () => "21843" };
  assert.equal(coerceInt(bigIntObj), 21843);
});

test("coerceInt handles objects with only toString", () => {
  const obj = { toString: () => "999" };
  assert.equal(coerceInt(obj), 999);
});

test("coerceInt returns 0 for non-numeric types", () => {
  assert.equal(coerceInt(undefined), 0);
  assert.equal(coerceInt(null), 0);
  assert.equal(coerceInt("not a number"), 0);
});

// ---------------------------------------------------------------------------
// extractDiffState — ChannelDifferenceTooLong
// ---------------------------------------------------------------------------

test("extractDiffState parses ChannelDifferenceTooLong response", () => {
  const diff = {
    className: "updates.ChannelDifferenceTooLong",
    timeout: 30,
    dialog: { pts: 21843 },
    messages: [{ id: 100, message: "recent but not new" }],
  };

  const state = extractDiffState(diff);
  assert.equal(state.pts, 21843);
  assert.equal(state.timeout, 30);
  // TooLong should NOT include messages — they are recent, not new.
  assert.deepEqual(state.newMessages, []);
});

test("extractDiffState handles TooLong with BigInteger pts in dialog", () => {
  const diff = {
    className: "updates.ChannelDifferenceTooLong",
    timeout: 15,
    dialog: { pts: BigInt(50000) },
    messages: [],
  };

  const state = extractDiffState(diff);
  assert.equal(state.pts, 50000);
});

test("extractDiffState uses default timeout when TooLong has no timeout", () => {
  const diff = {
    className: "updates.ChannelDifferenceTooLong",
    dialog: { pts: 100 },
    messages: [],
  };

  const state = extractDiffState(diff);
  assert.equal(state.timeout, DEFAULT_DIFF_INTERVAL_S);
});

// ---------------------------------------------------------------------------
// extractDiffState — ChannelDifferenceEmpty
// ---------------------------------------------------------------------------

test("extractDiffState parses ChannelDifferenceEmpty response", () => {
  const diff = {
    className: "updates.ChannelDifferenceEmpty",
    pts: 21843,
    timeout: 10,
  };

  const state = extractDiffState(diff);
  assert.equal(state.pts, 21843);
  assert.equal(state.timeout, 10);
  assert.deepEqual(state.newMessages, []);
});

test("extractDiffState handles Empty with no timeout", () => {
  const diff = {
    className: "updates.ChannelDifferenceEmpty",
    pts: 500,
  };

  const state = extractDiffState(diff);
  assert.equal(state.pts, 500);
  assert.equal(state.timeout, DEFAULT_DIFF_INTERVAL_S);
});

// ---------------------------------------------------------------------------
// extractDiffState — ChannelDifference (normal diff with new messages)
// ---------------------------------------------------------------------------

test("extractDiffState parses ChannelDifference with new messages", () => {
  const msg1 = { id: 21730, message: "alert text", date: 1709000000 };
  const msg2 = { id: 21731, message: "another alert", date: 1709000005 };
  const diff = {
    className: "updates.ChannelDifference",
    pts: 21844,
    timeout: 5,
    newMessages: [msg1, msg2],
    otherUpdates: [],
  };

  const state = extractDiffState(diff);
  assert.equal(state.pts, 21844);
  assert.equal(state.timeout, 5);
  assert.equal(state.newMessages.length, 2);
  assert.equal(state.newMessages[0].id, 21730);
  assert.equal(state.newMessages[1].id, 21731);
});

test("extractDiffState handles ChannelDifference with empty newMessages", () => {
  const diff = {
    className: "updates.ChannelDifference",
    pts: 21844,
    timeout: 20,
    newMessages: [],
    otherUpdates: [],
  };

  const state = extractDiffState(diff);
  assert.equal(state.pts, 21844);
  assert.deepEqual(state.newMessages, []);
});

test("extractDiffState handles ChannelDifference with missing newMessages", () => {
  const diff = {
    className: "updates.ChannelDifference",
    pts: 300,
  };

  const state = extractDiffState(diff);
  assert.equal(state.pts, 300);
  assert.deepEqual(state.newMessages, []);
});

// ---------------------------------------------------------------------------
// extractDiffState — edge cases
// ---------------------------------------------------------------------------

test("extractDiffState returns zeros for null/undefined input", () => {
  assert.deepEqual(extractDiffState(null), {
    pts: 0,
    timeout: DEFAULT_DIFF_INTERVAL_S,
    newMessages: [],
  });
  assert.deepEqual(extractDiffState(undefined), {
    pts: 0,
    timeout: DEFAULT_DIFF_INTERVAL_S,
    newMessages: [],
  });
});

test("extractDiffState handles unknown className as ChannelDifference", () => {
  const diff = {
    className: "something.Unknown",
    pts: 42,
    timeout: 7,
    newMessages: [{ id: 1, message: "test" }],
  };

  const state = extractDiffState(diff);
  assert.equal(state.pts, 42);
  assert.equal(state.newMessages.length, 1);
});

test("extractDiffState handles BigInteger-like objects in pts fields", () => {
  const bigPts = { valueOf: () => 99999, toString: () => "99999" };
  const diff = {
    className: "updates.ChannelDifferenceEmpty",
    pts: bigPts,
    timeout: { valueOf: () => 12 },
  };

  const state = extractDiffState(diff);
  assert.equal(state.pts, 99999);
  assert.equal(state.timeout, 12);
});
