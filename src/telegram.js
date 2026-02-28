import input from "input";
import { TelegramClient } from "telegram";
import { NewMessage } from "telegram/events/index.js";
import { StringSession } from "telegram/sessions/index.js";

export function toPeer(value) {
  if (/^-?\d+$/.test(value)) {
    return Number(value);
  }
  return value;
}

export function normalizeSourceChannel(value) {
  const trimmed = String(value || "").trim();
  const tMeMatch = trimmed.match(/^https?:\/\/t\.me\/([^/?#]+)/i);
  if (tMeMatch) {
    return `@${tMeMatch[1]}`;
  }
  return trimmed;
}

export function normalizeMessageDate(rawDate) {
  if (rawDate instanceof Date) {
    return rawDate;
  }

  if (typeof rawDate === "number") {
    // GramJS history objects may provide Unix timestamps in seconds.
    const asMs = rawDate > 1_000_000_000_000 ? rawDate : rawDate * 1000;
    return new Date(asMs);
  }

  return new Date(rawDate);
}

export function formatPreview(text, max = 140) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .slice(0, max);
}

export function safeEntityField(entity, field) {
  try {
    return entity?.[field];
  } catch {
    return undefined;
  }
}

export async function createTelegramGateway(config, logger = console) {
  const stringSession = new StringSession(config.telegramSession);
  const client = new TelegramClient(
    stringSession,
    config.telegramApiId,
    config.telegramApiHash,
    { connectionRetries: 5 },
  );

  const shouldUseInteractiveLogin = !config.telegramSession;

  await client.start({
    phoneNumber: async () => {
      if (config.telegramPhone) {
        return config.telegramPhone;
      }
      return input.text("Telegram phone number (+countrycode...): ");
    },
    password: async () => input.text("Telegram 2FA password: "),
    phoneCode: async () => input.text("Telegram login code: "),
    onError: (error) => logger.error("[Telegram] login error:", error),
  });

  if (shouldUseInteractiveLogin) {
    logger.info("Login successful. Save this TELEGRAM_SESSION_STRING for next runs:");
    logger.info(client.session.save());
  }

  const sourceChannel = normalizeSourceChannel(config.sourceChannel);
  const sourceChatFilter = toPeer(sourceChannel);
  let sourceEntity;

  try {
    sourceEntity = await client.getEntity(sourceChatFilter);
  } catch (error) {
    logger.error(`[Telegram] Failed resolving SOURCE_CHANNEL "${config.sourceChannel}"`, error);
    throw new Error(
      `Failed to resolve SOURCE_CHANNEL "${config.sourceChannel}". Use @username, t.me link, or numeric id and ensure this account can access the channel.`,
    );
  }

  const sourceId = safeEntityField(sourceEntity, "id");
  const sourceTitle = safeEntityField(sourceEntity, "title");
  const sourceUsername = safeEntityField(sourceEntity, "username");
  logger.info(
    `[Telegram] SOURCE_CHANNEL resolved -> id=${String(sourceId)} title="${sourceTitle || "n/a"}" username="@${sourceUsername || "n/a"}"`,
  );

  async function verifySourceChannelAccess(probeLimit = 3) {
    const probeMessages = await client.getMessages(sourceEntity, { limit: probeLimit });
    logger.info(
      `[Telegram] Channel probe fetched ${probeMessages.length} latest message(s) from ${sourceChannel}`,
    );
    probeMessages.forEach((msg, index) => {
      const date = normalizeMessageDate(msg?.date);
      logger.info(
        `[Telegram] Probe #${index + 1}: id=${msg?.id} date=${date.toISOString()} preview="${formatPreview(msg?.message)}"`,
      );
    });
    return probeMessages.length;
  }

  function onSourceMessage(handler) {
    logger.info(`[Telegram] Subscribing to source channel: ${sourceChannel}`);
    client.addEventHandler(
      async (event) => {
        const text = event?.message?.message;
        if (!text || typeof text !== "string") {
          logger.info("[Telegram] Ignored non-text update from source filter");
          return;
        }

        const date = normalizeMessageDate(event.message.date);
        logger.info(
          `[Telegram] Incoming message #${event.message.id} date=${date.toISOString()} chars=${text.length} preview="${formatPreview(text)}"`,
        );

        try {
          await handler({
            text,
            messageId: event.message.id,
            date,
          });
        } catch (error) {
          logger.error(`[Telegram] Handler failed for message #${event.message.id}`, error);
        }
      },
      new NewMessage({ chats: [sourceEntity] }),
    );
  }

  async function sendText(text, targetChatId) {
    const targetPeer = toPeer(targetChatId);
    await client.sendMessage(targetPeer, { message: text });
  }

  async function getRecentSourceMessages(minutes, limit = 200) {
    const cutoffMs = Date.now() - minutes * 60 * 1000;
    const messages = await client.getMessages(sourceEntity, { limit });
    logger.info(
      `[HISTORY] Fetched ${messages.length} candidate message(s), cutoff=${new Date(cutoffMs).toISOString()}`,
    );

    const recent = messages
      .filter((msg) => {
        if (!msg?.message || typeof msg.message !== "string") {
          return false;
        }

        const date = normalizeMessageDate(msg?.date);
        if (Number.isNaN(date.getTime())) {
          return false;
        }

        return date.getTime() >= cutoffMs;
      })
      .map((msg) => ({
        text: msg.message,
        messageId: msg.id,
        date: normalizeMessageDate(msg.date),
      }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    logger.info(`[HISTORY] ${recent.length} message(s) remain after time/text filtering`);
    recent.slice(-3).forEach((msg, index) => {
      logger.info(
        `[HISTORY] Keep sample #${index + 1}: id=${msg.messageId} date=${msg.date.toISOString()} preview="${formatPreview(msg.text)}"`,
      );
    });

    return recent;
  }

  function buildSourceMessageLink(messageId) {
    return buildSourceMessageLinkFromMeta(sourceUsername, sourceId, messageId);
  }

  return {
    client,
    onSourceMessage,
    sendText,
    getRecentSourceMessages,
    buildSourceMessageLink,
    verifySourceChannelAccess,
    sourceChannelMeta: {
      resolvedSourceChannel: sourceChannel,
      id: sourceId,
      title: sourceTitle,
      username: sourceUsername,
    },
  };
}

export function buildSourceMessageLinkFromMeta(sourceUsername, sourceId, messageId) {
  if (!messageId) {
    return null;
  }

  if (sourceUsername) {
    return `https://t.me/${sourceUsername}/${messageId}`;
  }

  if (typeof sourceId === "number" || typeof sourceId === "bigint" || sourceId) {
    const channelId = String(sourceId).replace(/^-100/, "");
    return `https://t.me/c/${channelId}/${messageId}`;
  }

  return null;
}
