# when-to-exit

Node.js service that listens to Home Front Command alerts in Telegram and sends a
"safe to leave the safe room" message after 10 minutes without new alerts for
configured towns.

## Features

- Reads channel posts using Telegram MTProto (user account session).
- Parses Hebrew alert format and extracts settlements/towns.
- Supports base-city matching:
  - If `MONITORED_TOWNS` includes `באר שבע`, it also matches alerts like
    `באר שבע - דרום`, `באר שבע - מזרח`, etc.
- Keeps independent resettable timers per monitored town.

## Setup

1. Install dependencies:
   - `npm install`
2. Copy env template:
   - `cp .env.example .env`
3. Fill required values in `.env`:
   - `TELEGRAM_API_ID`
   - `TELEGRAM_API_HASH`
   - `SOURCE_CHANNEL`
   - `TARGET_CHAT_IDS` (preferred, comma-separated) or `TARGET_CHAT_ID`
   - `MONITORED_TOWNS` (for example: `עומר, באר שבע`)
   - Optional replay controls:
     - `FETCH_PAST_ALERTS_ON_START=true|false` (default `false`)
     - `PAST_ALERTS_MINUTES` (default equals `TIMER_MINUTES`)

## First Run Authentication

If `TELEGRAM_SESSION_STRING` is empty:
- Set `TELEGRAM_PHONE`.
- Run `npm start`.
- Enter Telegram login code (and 2FA password if enabled).
- The app prints a `TELEGRAM_SESSION_STRING`.
- Save this value in `.env` and remove `TELEGRAM_PHONE` for future runs.

## Run

- Development mode: `npm run dev`
- Normal mode: `npm start`

## Behavior

- On every incoming alert message, app checks whether any monitored town is in
  the alert text.
- Optional on startup: if `FETCH_PAST_ALERTS_ON_START=true`, app first pulls past
  messages from the source channel for the last `PAST_ALERTS_MINUTES` minutes
  (or `TIMER_MINUTES` if not set) and processes them before switching to live mode.
- For each matched monitored town:
  - Start a 10-minute timer if not running.
  - Reset timer back to 10 minutes if already running.
- When timer expires, app sends a private Telegram message to each configured
  target in `TARGET_CHAT_IDS` (or single `TARGET_CHAT_ID`):
  - `אין התרעות חדשות עבור <town> ... אפשר לצאת מהמרחב המוגן.`
  - Includes a link to the latest matching alert message when available.

## Quick Test

Set `TIMER_MINUTES=1` in `.env`, then:
- Send one alert containing a monitored town -> timer starts.
- Send another alert for same town within a minute -> timer resets.
- Wait one full minute without new alert -> one "safe to leave" message arrives.
