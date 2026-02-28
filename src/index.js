import { loadConfig } from "./config.js";
import { classifyMessageType, matchConfiguredTowns, shouldIgnoreAlertMessage } from "./parser.js";
import { createTelegramGateway } from "./telegram.js";
import { TownTimerManager } from "./timers.js";

function buildSafeMessage(town, timerMinutes, lastAlertLink) {
  const base = `אין התרעות חדשות עבור ${town} ב-${timerMinutes} הדקות האחרונות. אפשר לצאת מהמרחב המוגן.`;
  if (!lastAlertLink) {
    return base;
  }
  return `${base}\n\nהתרעה אחרונה: ${lastAlertLink}`;
}

function buildImmediateSafeUpdateMessage(town, lastAlertLink) {
  const base = `עדכון פיקוד העורף: באזור ${town} ניתן לצאת מהמרחב המוגן, אך יש להישאר בקרבתו.`;
  if (!lastAlertLink) {
    return base;
  }
  return `${base}\n\nעדכון רשמי: ${lastAlertLink}`;
}

async function main() {
  const config = loadConfig();
  const timerDurationMs = config.timerMinutes * 60 * 1000;
  const processedMessageIds = new Set();

  const telegram = await createTelegramGateway(config);
  console.info(
    `[SOURCE] Resolved source -> id=${String(telegram.sourceChannelMeta.id)} title="${telegram.sourceChannelMeta.title || "n/a"}" username="@${telegram.sourceChannelMeta.username || "n/a"}"`,
  );
  await telegram.verifySourceChannelAccess(3);

  const timerManager = new TownTimerManager({
    durationMs: timerDurationMs,
    onExpire: async (town, context = {}) => {
      const message = buildSafeMessage(town, config.timerMinutes, context.alertLink);
      for (const targetChatId of config.targetChatIds) {
        try {
          console.info(`[NOTIFY] Sending safe message for "${town}" to ${targetChatId}`);
          await telegram.sendText(message, targetChatId);
          console.info(`[NOTIFY] Sent to ${targetChatId}: ${message}`);
        } catch (error) {
          console.error(
            `[NOTIFY] Failed sending safe message for "${town}" to ${targetChatId}`,
            error,
          );
        }
      }
    },
  });

  setInterval(() => {
    const pending = timerManager.getPendingStatuses();
    if (pending.length === 0) {
      return;
    }

    const summary = pending
      .map(
        (item) =>
          `${item.town}: ${Math.ceil(item.remainingMs / 1000)}s left (until ${item.expiresAt.toISOString()})`,
      )
      .join(" | ");
    console.info(`[STATUS] Pending notifications (${pending.length}) -> ${summary}`);
  }, 15_000);

  async function processAlertMessage({ text, messageId, date, source }) {
    if (processedMessageIds.has(messageId)) {
      console.info(`[RECEIVED] #${messageId} from ${source} skipped (already processed)`);
      return;
    }
    processedMessageIds.add(messageId);

    const singleLinePreview = text.replace(/\s+/g, " ").slice(0, 140);
    console.info(
      `[RECEIVED] #${messageId} from ${source} at ${date.toISOString()} :: ${singleLinePreview}`,
    );

    if (shouldIgnoreAlertMessage(text)) {
      console.info(`[FILTER] #${messageId} skipped (upcoming-warning bulletin)`);
      return;
    }

    const { alertTowns, matched, messageType } = matchConfiguredTowns(text, config.monitoredTowns);
    const classified = classifyMessageType(text);
    console.info(
      `[PARSE] #${messageId} extracted ${alertTowns.length} town(s): ${
        alertTowns.length ? alertTowns.join(", ") : "none"
      }`,
    );
    console.info(`[TYPE] #${messageId} classified as ${classified}`);

    if (matched.size === 0) {
      console.info(`[MATCH] #${messageId} no monitored towns matched`);
      return;
    }

    const matchedSummary = [...matched.entries()]
      .map(([monitoredTown, variants]) => `${monitoredTown} <= [${variants.join(", ")}]`)
      .join(" | ");
    console.info(`[MATCH] #${messageId} monitored match(es): ${matchedSummary}`);

    if (messageType === "safe_exit_update") {
      for (const [monitoredTown] of matched.entries()) {
        timerManager.clearTown(monitoredTown, "official safe-exit update");
        const immediateMessage = buildImmediateSafeUpdateMessage(
          monitoredTown,
          telegram.buildSourceMessageLink(messageId),
        );
        for (const targetChatId of config.targetChatIds) {
          try {
            console.info(
              `[NOTIFY_IMMEDIATE] Sending official safe-exit update for "${monitoredTown}" to ${targetChatId}`,
            );
            await telegram.sendText(immediateMessage, targetChatId);
            console.info(`[NOTIFY_IMMEDIATE] Sent to ${targetChatId}: ${immediateMessage}`);
          } catch (error) {
            console.error(
              `[NOTIFY_IMMEDIATE] Failed sending update for "${monitoredTown}" to ${targetChatId}`,
              error,
            );
          }
        }
      }
      return;
    }

    for (const [monitoredTown, matchingAlertTowns] of matched.entries()) {
      timerManager.upsert(monitoredTown, matchingAlertTowns, date, {
        alertMessageId: messageId,
        alertLink: telegram.buildSourceMessageLink(messageId),
      });
    }
  }

  if (config.fetchPastAlertsOnStart) {
    console.info(
      `[HISTORY] Loading past alerts from last ${config.pastAlertsMinutes} minute(s)`,
    );
    const pastMessages = await telegram.getRecentSourceMessages(config.pastAlertsMinutes);
    console.info(`[HISTORY] Loaded ${pastMessages.length} past message(s)`);
    for (const message of pastMessages) {
      await processAlertMessage({ ...message, source: "history" });
    }
  } else {
    console.info("[HISTORY] Disabled (FETCH_PAST_ALERTS_ON_START=false)");
  }

  telegram.onSourceMessage(async (message) => {
    await processAlertMessage({ ...message, source: "live" });
  });

  console.info(
    `Listening for alerts from "${telegram.sourceChannelMeta.resolvedSourceChannel}" and notifying "${config.targetChatIds.join(", ")}"`,
  );
  console.info(`Monitored towns: ${config.monitoredTowns.join(", ")}`);
  console.info(`Quiet window timer: ${config.timerMinutes} minute(s)`);
  console.info(
    `Past-alert replay: ${config.fetchPastAlertsOnStart ? "enabled" : "disabled"} (lookback: ${config.pastAlertsMinutes}m)`,
  );
}

main().catch((error) => {
  console.error("Fatal startup error:", error);
  process.exitCode = 1;
});
