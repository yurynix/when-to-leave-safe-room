const HEBREW_DASH = /[־–—]/g;
const MULTI_SPACE = /\s+/g;
const UPCOMING_WARNING_PHRASE = "בדקות הקרובות צפויות להתקבל התרעות באזורך";
const SAFE_EXIT_PHRASE = "ניתן לצאת מהמרחב המוגן";
const SAFE_EXIT_AREAS_PHRASE = "באזורים הבאים ניתן לצאת מהמרחב המוגן";

export function normalizeTownName(value) {
  return value
    .replace(HEBREW_DASH, "-")
    .replace(/\s*-\s*/g, " - ")
    .replace(MULTI_SPACE, " ")
    .trim();
}

export function shouldIgnoreAlertMessage(alertText) {
  return alertText.includes(UPCOMING_WARNING_PHRASE);
}

function firstNonEmptyLine(alertText) {
  const lines = alertText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return lines[0] || "";
}

export function classifyMessageType(alertText) {
  const firstLine = firstNonEmptyLine(alertText);
  if (alertText.includes(UPCOMING_WARNING_PHRASE)) {
    return "upcoming_warning";
  }

  if (firstLine.includes("עדכון") && alertText.includes(SAFE_EXIT_PHRASE)) {
    return "safe_exit_update";
  }

  return "alert";
}

function looksLikeHeaderOrInstruction(line) {
  return (
    (line.startsWith("אזור ") && !line.includes("(")) ||
    line.includes("היכנסו למרחב המוגן") ||
    line.startsWith("ירי רקטות וטילים") ||
    line.startsWith("🚨 ירי רקטות וטילים") ||
    line.startsWith("🚨 מבזק") ||
    line.startsWith("🚨 עדכון") ||
    line.includes(SAFE_EXIT_AREAS_PHRASE) ||
    line.includes(SAFE_EXIT_PHRASE)
  );
}

function parseTownLine(line, { allowWithoutBracket = false } = {}) {
  const bracketIndex = line.indexOf("(");
  if (bracketIndex === -1 && !allowWithoutBracket) {
    return [];
  }

  const townsPart = (bracketIndex === -1 ? line : line.slice(0, bracketIndex)).trim();
  if (!townsPart) {
    return [];
  }

  return townsPart
    .split(",")
    .map((part) => normalizeTownName(part))
    .filter(Boolean);
}

export function extractTownsFromAlert(alertText) {
  if (shouldIgnoreAlertMessage(alertText)) {
    return [];
  }
  const messageType = classifyMessageType(alertText);
  const allowWithoutBracket = messageType === "safe_exit_update";

  const unique = new Set();
  const lines = alertText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (looksLikeHeaderOrInstruction(line)) {
      continue;
    }

    const towns = parseTownLine(line, { allowWithoutBracket });
    for (const town of towns) {
      if (town === "ירי רקטות וטילים" || town === "🚨 ירי רקטות וטילים") {
        continue;
      }
      unique.add(town);
    }
  }

  return [...unique];
}

function isBaseCityMatch(monitoredTown, alertTown) {
  if (alertTown === monitoredTown) {
    return true;
  }

  return alertTown.startsWith(`${monitoredTown} - `);
}

export function matchConfiguredTowns(alertText, monitoredTowns) {
  const messageType = classifyMessageType(alertText);
  if (messageType === "upcoming_warning") {
    return {
      alertTowns: [],
      matched: new Map(),
      messageType,
    };
  }

  const alertTowns = extractTownsFromAlert(alertText);
  const normalizedAlertTowns = alertTowns.map((town) => normalizeTownName(town));
  const normalizedMonitored = monitoredTowns.map((town) => normalizeTownName(town));

  const matched = new Map();

  for (const monitoredTown of normalizedMonitored) {
    const matchingAlertTowns = normalizedAlertTowns.filter((alertTown) =>
      isBaseCityMatch(monitoredTown, alertTown),
    );

    if (matchingAlertTowns.length > 0) {
      matched.set(monitoredTown, matchingAlertTowns);
    }
  }

  return {
    alertTowns: normalizedAlertTowns,
    matched,
    messageType,
  };
}
