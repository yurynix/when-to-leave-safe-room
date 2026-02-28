import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSourceMessageLinkFromMeta,
  formatPreview,
  normalizeMessageDate,
  normalizeSourceChannel,
  safeEntityField,
  toPeer,
} from "../src/telegram.js";

test("toPeer converts numeric strings and keeps usernames", () => {
  assert.equal(toPeer("12345"), 12345);
  assert.equal(toPeer("-100123"), -100123);
  assert.equal(toPeer("@PikudHaOref_all"), "@PikudHaOref_all");
});

test("normalizeSourceChannel supports t.me links and @username", () => {
  assert.equal(normalizeSourceChannel("@foo"), "@foo");
  assert.equal(normalizeSourceChannel(" https://t.me/PikudHaOref_all "), "@PikudHaOref_all");
  assert.equal(
    normalizeSourceChannel("https://t.me/PikudHaOref_all?single"),
    "@PikudHaOref_all",
  );
});

test("normalizeMessageDate handles Date, unix seconds, unix milliseconds", () => {
  const fromDate = new Date("2026-01-01T00:00:00.000Z");
  assert.equal(normalizeMessageDate(fromDate), fromDate);

  const fromSeconds = normalizeMessageDate(1767225600); // 2026-01-01
  assert.equal(fromSeconds.toISOString(), "2026-01-01T00:00:00.000Z");

  const fromMs = normalizeMessageDate(1767225600000);
  assert.equal(fromMs.toISOString(), "2026-01-01T00:00:00.000Z");
});

test("formatPreview flattens whitespace and truncates", () => {
  assert.equal(formatPreview("a\n\nb\tc"), "a b c");
  assert.equal(formatPreview("123456789", 5), "12345");
});

test("safeEntityField returns undefined on throwing access", () => {
  const explosive = Object.create(null);
  Object.defineProperty(explosive, "bad", {
    get() {
      throw new Error("boom");
    },
  });

  assert.equal(safeEntityField({ id: 1 }, "id"), 1);
  assert.equal(safeEntityField(explosive, "bad"), undefined);
});

test("buildSourceMessageLinkFromMeta prefers username and supports id fallback", () => {
  assert.equal(
    buildSourceMessageLinkFromMeta("PikudHaOref_all", -1001441886157, 21316),
    "https://t.me/PikudHaOref_all/21316",
  );
  assert.equal(
    buildSourceMessageLinkFromMeta("", -1001441886157, 21316),
    "https://t.me/c/1441886157/21316",
  );
  assert.equal(buildSourceMessageLinkFromMeta("", "", 21316), null);
  assert.equal(buildSourceMessageLinkFromMeta("foo", 1, 0), null);
});
