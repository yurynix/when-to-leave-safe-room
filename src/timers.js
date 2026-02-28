export class TownTimerManager {
  constructor({ durationMs, onExpire, logger = console }) {
    this.durationMs = durationMs;
    this.onExpire = onExpire;
    this.logger = logger;
    this.timers = new Map();
  }

  upsert(town, matchingAlertTowns = [], alertDate = new Date(), metadata = {}) {
    const alertAt = alertDate instanceof Date ? alertDate : new Date(alertDate);
    if (Number.isNaN(alertAt.getTime())) {
      throw new Error(`Invalid alert date for town "${town}"`);
    }

    const existing = this.timers.get(town);
    if (existing && alertAt.getTime() < existing.alertAt.getTime()) {
      this.logger.info(
        `[SKIP_OLD] ${town} alertAt=${alertAt.toISOString()} older than tracked=${existing.alertAt.toISOString()}`,
      );
      return;
    }

    if (existing) {
      clearTimeout(existing.timeout);
    }

    const expiresAt = new Date(alertAt.getTime() + this.durationMs);
    const delayMs = Math.max(0, expiresAt.getTime() - Date.now());

    const timeout = setTimeout(async () => {
      this.timers.delete(town);
      this.logger.info(
        `[EXPIRE_TRIGGER] ${town} now=${new Date().toISOString()} scheduledExpiresAt=${expiresAt.toISOString()}`,
      );
      try {
        await this.onExpire(town, {
          alertAt,
          expiresAt,
          matchingAlertTowns,
          ...metadata,
        });
        this.logger.info(`[EXPIRE] ${town} -> safe notification sent`);
      } catch (error) {
        this.logger.error(`[EXPIRE] ${town} -> notification failed`, error);
      }
    }, delayMs);

    this.timers.set(town, {
      timeout,
      startedAt: new Date(),
      alertAt,
      expiresAt,
      matchingAlertTowns,
      ...metadata,
    });

    const mode = existing ? "RESET" : "START";
    this.logger.info(
      `[${mode}] ${town} (${this.durationMs / 60000}m) now=${new Date().toISOString()} alertAt=${alertAt.toISOString()} expiresAt=${expiresAt.toISOString()} in=${Math.ceil(
        delayMs / 1000,
      )}s from alerts: ${matchingAlertTowns.join(", ")}`,
    );
  }

  clearAll() {
    for (const { timeout } of this.timers.values()) {
      clearTimeout(timeout);
    }
    this.timers.clear();
  }

  clearTown(town, reason = "") {
    const existing = this.timers.get(town);
    if (!existing) {
      return false;
    }

    clearTimeout(existing.timeout);
    this.timers.delete(town);
    this.logger.info(`[CLEAR] ${town}${reason ? ` (${reason})` : ""}`);
    return true;
  }

  getPendingStatuses(nowMs = Date.now()) {
    const pending = [];

    for (const [town, data] of this.timers.entries()) {
      const remainingMs = Math.max(0, data.expiresAt.getTime() - nowMs);
      pending.push({
        town,
        remainingMs,
        alertAt: data.alertAt,
        expiresAt: data.expiresAt,
        matchingAlertTowns: data.matchingAlertTowns,
      });
    }

    return pending.sort((a, b) => a.remainingMs - b.remainingMs);
  }
}
