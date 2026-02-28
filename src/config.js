import dotenv from "dotenv";

dotenv.config();

function required(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

function optional(name, fallback = "") {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }
  return value.trim();
}

function parsePositiveInt(name, fallback) {
  const raw = optional(name, String(fallback));
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Environment variable ${name} must be a positive integer`);
  }
  return value;
}

function parseBoolean(name, fallback = false) {
  const raw = optional(name, fallback ? "true" : "false").toLowerCase();
  if (["1", "true", "yes", "on"].includes(raw)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(raw)) {
    return false;
  }
  throw new Error(`Environment variable ${name} must be a boolean`);
}

function parseTowns(raw) {
  return raw
    .split(",")
    .map((town) => town.trim())
    .filter(Boolean);
}

function parseCsvList(raw) {
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function parseTargetChatIds() {
  const plural = optional("TARGET_CHAT_IDS");
  if (plural) {
    const ids = parseCsvList(plural);
    if (ids.length === 0) {
      throw new Error("TARGET_CHAT_IDS must contain at least one chat id");
    }
    return ids;
  }

  const single = optional("TARGET_CHAT_ID");
  if (single) {
    return [single];
  }

  throw new Error(
    "Missing target chat configuration: set TARGET_CHAT_IDS (preferred) or TARGET_CHAT_ID",
  );
}

export function loadConfig() {
  const monitoredTownsRaw = required("MONITORED_TOWNS");
  const monitoredTowns = parseTowns(monitoredTownsRaw);
  if (monitoredTowns.length === 0) {
    throw new Error("MONITORED_TOWNS must contain at least one town name");
  }

  const timerMinutes = parsePositiveInt("TIMER_MINUTES", 10);
  const fetchPastAlertsOnStart = parseBoolean("FETCH_PAST_ALERTS_ON_START", false);

  return {
    telegramApiId: parsePositiveInt("TELEGRAM_API_ID", 0),
    telegramApiHash: required("TELEGRAM_API_HASH"),
    telegramSession: optional("TELEGRAM_SESSION_STRING"),
    telegramPhone: optional("TELEGRAM_PHONE"),
    telegramHealthcheckIntervalSeconds: parsePositiveInt("TELEGRAM_HEALTHCHECK_INTERVAL_SECONDS", 30),
    sourceChannel: required("SOURCE_CHANNEL"),
    targetChatIds: parseTargetChatIds(),
    monitoredTowns,
    timerMinutes,
    fetchPastAlertsOnStart,
    pastAlertsMinutes: parsePositiveInt("PAST_ALERTS_MINUTES", timerMinutes),
  };
}
