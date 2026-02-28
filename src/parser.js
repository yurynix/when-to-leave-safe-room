const HEBREW_DASH = /[־–—]/g;
const MULTI_SPACE = /\s+/g;
const UPCOMING_WARNING_PHRASE = "בדקות הקרובות צפויות להתקבל התרעות באזורך";

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

function looksLikeHeaderOrInstruction(line) {
  return (
    (line.startsWith("אזור ") && !line.includes("(")) ||
    line.includes("היכנסו למרחב המוגן") ||
    line.startsWith("ירי רקטות וטילים")
  );
}

function parseTownLine(line) {
  const bracketIndex = line.indexOf("(");
  if (bracketIndex === -1) {
    return [];
  }

  const townsPart = line.slice(0, bracketIndex).trim();
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

  const unique = new Set();
  const lines = alertText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (looksLikeHeaderOrInstruction(line)) {
      continue;
    }

    const towns = parseTownLine(line);
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
  if (shouldIgnoreAlertMessage(alertText)) {
    return {
      alertTowns: [],
      matched: new Map(),
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
  };
}
