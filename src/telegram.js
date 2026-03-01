import input from "input";
import { Api, TelegramClient } from "telegram";
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

export const DEFAULT_DIFF_INTERVAL_S = 5;

export function coerceInt(val) {
  if (typeof val === "bigint") return Number(val);
  if (typeof val === "object" && val != null) return Number(val.valueOf?.() ?? String(val));
  return typeof val === "number" ? val : 0;
}

/** Extract PTS and timeout from a getChannelDifference response. */
export function extractDiffState(diff) {
  if (!diff) {
    return { pts: 0, timeout: DEFAULT_DIFF_INTERVAL_S, newMessages: [] };
  }

  let pts = 0;
  let timeout = DEFAULT_DIFF_INTERVAL_S;
  let newMessages = [];
  const className = diff.className || "";

  if (className.includes("TooLong")) {
    // ChannelDifferenceTooLong — PTS is inside the dialog object.
    pts = coerceInt(diff.dialog?.pts);
    timeout = coerceInt(diff.timeout) || DEFAULT_DIFF_INTERVAL_S;
    // messages field contains recent messages but not "new" ones — skip.
  } else if (className.includes("Empty")) {
    // ChannelDifferenceEmpty — no new messages.
    pts = coerceInt(diff.pts);
    timeout = coerceInt(diff.timeout) || DEFAULT_DIFF_INTERVAL_S;
  } else {
    // ChannelDifference — has newMessages and updated PTS.
    pts = coerceInt(diff.pts);
    timeout = coerceInt(diff.timeout) || DEFAULT_DIFF_INTERVAL_S;
    newMessages = diff.newMessages || [];
  }

  return { pts, timeout, newMessages };
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

  const rawSourceId = safeEntityField(sourceEntity, "id");
  // GramJS may return BigInteger objects for entity IDs. Coerce to plain number
  // so that filter comparisons (===) and logging work reliably.
  const sourceId =
    typeof rawSourceId === "bigint"
      ? Number(rawSourceId)
      : typeof rawSourceId === "object" && rawSourceId != null
        ? Number(rawSourceId.valueOf?.() ?? String(rawSourceId))
        : rawSourceId;
  const sourceTitle = safeEntityField(sourceEntity, "title");
  const sourceUsername = safeEntityField(sourceEntity, "username");
  logger.info(
    `[Telegram] SOURCE_CHANNEL resolved -> id=${sourceId} (type=${typeof sourceId}) title="${sourceTitle || "n/a"}" username="@${sourceUsername || "n/a"}"`,
  );

  // Resolve the InputChannel once for use in getChannelDifference calls.
  let inputChannel;
  try {
    inputChannel = await client.getInputEntity(sourceEntity);
  } catch (error) {
    logger.warn?.("[Telegram] getInputEntity failed:", error?.message || String(error));
  }

  // GramJS never calls getChannelDifference internally (catchUp is a stub).
  // We implement it ourselves: call getChannelDifference to register interest
  // with Telegram's server and extract the channel's current PTS.
  // This makes the server start pushing live updates AND gives us a delta
  // mechanism to catch any messages that passive delivery misses.
  let channelPts = 0;

  async function fetchChannelDifference(pts, force = false) {
    return client.invoke(
      new Api.updates.GetChannelDifference({
        force,
        channel: inputChannel,
        filter: new Api.ChannelMessagesFilterEmpty(),
        pts,
        limit: 100,
      }),
    );
  }

  // Initial call with pts=1 to get the current PTS (will return TooLong).
  if (inputChannel) {
    try {
      const diff = await fetchChannelDifference(1, true);
      const state = extractDiffState(diff);
      channelPts = state.pts;
      const className = diff?.className || "unknown";
      logger.info(
        `[DIFF] Initial getChannelDifference -> ${className}, pts=${channelPts}, server timeout=${state.timeout}s`,
      );
    } catch (error) {
      logger.warn?.("[DIFF] Initial getChannelDifference failed:", error?.message || String(error));
    }
  }

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
    logger.info(
      `[Telegram] Filter sourceId=${sourceId} (type=${typeof sourceId})`,
    );

    // GramJS event handler — low-latency path for passive updates.
    // After registering interest via getChannelDifference, the server may
    // start pushing UpdateNewChannelMessage passively.
    const filter = new NewMessage({ chats: [sourceId] });
    client.addEventHandler(
      async (event) => {
        const text = event?.message?.message;
        if (!text || typeof text !== "string") return;
        const date = normalizeMessageDate(event.message.date);
        logger.info(
          `[LIVE] Message #${event.message.id} date=${date.toISOString()} chars=${text.length}`,
        );
        try {
          await handler({ text, messageId: event.message.id, date });
        } catch (error) {
          logger.error(`[LIVE] Handler failed for message #${event.message.id}`, error);
        }
      },
      filter,
    );

    // Periodic getChannelDifference loop — the proper MTProto mechanism.
    // Returns only deltas since last PTS, keeps the server subscription alive,
    // and catches anything passive delivery misses.
    if (!inputChannel || !channelPts) {
      logger.warn?.("[DIFF] Cannot start diff loop — missing inputChannel or PTS. Falling back to event handler only.");
      return;
    }

    let diffInFlight = false;

    async function runDiffCycle() {
      if (diffInFlight) return;
      diffInFlight = true;
      try {
        const diff = await fetchChannelDifference(channelPts);
        const state = extractDiffState(diff);
        const className = diff?.className || "";

        if (state.pts && state.pts > channelPts) {
          channelPts = state.pts;
        }

        if (state.newMessages.length > 0) {
          logger.info(`[DIFF] ${state.newMessages.length} new message(s), pts now=${channelPts}`);
          // Process oldest first.
          const sorted = [...state.newMessages].sort(
            (a, b) => (a.id || 0) - (b.id || 0),
          );
          for (const msg of sorted) {
            const text = msg?.message;
            if (!text || typeof text !== "string") continue;
            const date = normalizeMessageDate(msg.date);
            logger.info(
              `[DIFF] Message #${msg.id} date=${date.toISOString()} chars=${text.length} preview="${formatPreview(text)}"`,
            );
            try {
              await handler({ text, messageId: msg.id, date });
            } catch (error) {
              logger.error(`[DIFF] Handler failed for message #${msg.id}`, error);
            }
          }
        }

        // If server returned TooLong again (e.g. after a long disconnect), re-sync.
        if (className.includes("TooLong") && state.pts) {
          logger.info(`[DIFF] Received TooLong — re-synced pts=${state.pts}`);
        }
      } catch (error) {
        logger.error("[DIFF] getChannelDifference failed:", error?.message || String(error));
      } finally {
        diffInFlight = false;
      }
    }

    const diffTimer = setInterval(runDiffCycle, DEFAULT_DIFF_INTERVAL_S * 1000);
    diffTimer.unref?.();
    logger.info(`[DIFF] Started diff loop every ${DEFAULT_DIFF_INTERVAL_S}s, pts=${channelPts}`);
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

  async function checkConnectionHealth() {
    const wasConnected = Boolean(client.connected);
    if (!wasConnected) {
      logger.warn?.("[HEALTH] Telegram client reports disconnected, attempting reconnect...");
      try {
        await client.connect();
      } catch (error) {
        return {
          ok: false,
          wasConnected,
          isConnected: Boolean(client.connected),
          errorMessage: `Reconnect failed: ${error?.message || String(error)}`,
        };
      }
    }

    try {
      // Lightweight authenticated call to verify session + connectivity.
      await client.getMe();
      return {
        ok: true,
        wasConnected,
        isConnected: Boolean(client.connected),
        recovered: !wasConnected && Boolean(client.connected),
      };
    } catch (error) {
      return {
        ok: false,
        wasConnected,
        isConnected: Boolean(client.connected),
        errorMessage: `Health API check failed: ${error?.message || String(error)}`,
      };
    }
  }

  function buildSourceMessageLink(messageId) {
    return buildSourceMessageLinkFromMeta(sourceUsername, sourceId, messageId);
  }

  return {
    client,
    onSourceMessage,
    sendText,
    getRecentSourceMessages,
    checkConnectionHealth,
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
