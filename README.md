# when-to-exit

Telegram-based Home Front alert watcher that sends a **"safe to leave"** message
after a configurable quiet window (default: 10 minutes) per monitored town.

## ⚠️ Critical warning

> **Do not rely on this bot as an official life-safety authority.**
>
> Always wait for the official **Home Front Command** instruction that it is safe
> to leave the protected area.
>
> This project was **vibe-coded** and may contain mistakes, bugs, parsing errors,
> or unsafe assumptions.

## What it does

- Listens to a Telegram alert channel via MTProto (user session).
- Parses Hebrew alert messages and extracts settlements/towns.
- Matches configured towns, including base-city variants:
  - `באר שבע` matches `באר שבע - דרום/מזרח/מערב/צפון`.
- Keeps independent timers per monitored town:
  - new alert for same town resets timer.
  - timer is anchored to **alert time** (not processing time).
- Sends notifications to one or many Telegram targets.
- Includes link to the last matching alert in the notification.
- Optional startup replay of alerts from the last `N` minutes.
- Ignores "upcoming warning" bulletins (not real current alerts), e.g.:
  - `בדקות הקרובות צפויות להתקבל התרעות באזורך`

## Quick start

1. Install dependencies:
   - `npm install`
2. Create env file:
   - `cp .env.example .env`
3. Fill required values in `.env`:
   - `TELEGRAM_API_ID`
   - `TELEGRAM_API_HASH`
   - `SOURCE_CHANNEL`
   - `TARGET_CHAT_IDS` (preferred, comma-separated) or `TARGET_CHAT_ID`
   - `MONITORED_TOWNS` (example: `עומר, באר שבע`)
4. Run:
   - `npm start`

## First-time Telegram login

If `TELEGRAM_SESSION_STRING` is empty:

- Run `npm start`.
- Enter phone/code/2FA when prompted.
- Copy the printed `TELEGRAM_SESSION_STRING` into `.env`.
- Future runs can use the session string without interactive login.

## Configuration

See `.env.example` for full reference.

- `TIMER_MINUTES`  
  Quiet window per town (default `10`).
- `TARGET_CHAT_IDS`  
  Comma-separated list of recipient chat/user IDs.
- `FETCH_PAST_ALERTS_ON_START`  
  `true|false`, default `false`.
- `PAST_ALERTS_MINUTES`  
  Replay lookback window; defaults to `TIMER_MINUTES`.
- `TELEGRAM_HEALTHCHECK_INTERVAL_SECONDS`  
  Active Telegram connection health-check interval; default `30`.

## Runtime logs

Helpful log categories:

- `SOURCE` / `Telegram probe` — channel resolution/access checks.
- `HISTORY` — startup replay fetch and filtering.
- `RECEIVED` / `PARSE` / `MATCH` — per-message pipeline.
- `START` / `RESET` / `SKIP_OLD` — timer state changes.
- `STATUS` — every 15s while pending timers exist.
- `HEALTH` — Telegram connectivity failures/recovery events.
- `EXPIRE_TRIGGER` / `NOTIFY` — notification execution and delivery result.
- `FILTER` — skipped upcoming-warning messages.

## Scripts

- `npm start` — run service.
- `npm run dev` — run with watch mode.
- `npm test` — run test suite.
- `npm run test:coverage` — run tests with coverage report.

## Safety notes

- Timers are in-memory (process restart clears active timers).
- This tool is an aid and not an official life-safety authority.
- Always follow official Home Front Command instructions.
