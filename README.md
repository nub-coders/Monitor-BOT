# 🤖 Bot A - Central Monitoring Web Server & Telegram Alert Bot

A lightweight, production-ready Node.js backend service that monitors the health of downstream bots (e.g. **Bot B**, **Bot C**, **Bot D**) via heartbeat pings and alerts you on Telegram if any bot goes silent.

---

## 📋 Features

- 🛰️ **Multi-User Dynamic Service Registration**:
  - Add services interactively directly in Telegram via `/newservice`.
  - The bot prompts for **Service Name** and **Service Description**.
  - Generates a **Unique Secret Token** (`sec_...`) per service. No static shared secret token!
- 🔄 **3-State Health Lifecycle**:
  - 🟡 **`initialized`**: Newly registered, awaiting first heartbeat (*no false down alerts*).
  - 🟢 **`up`**: Active and reporting regular heartbeats.
  - 🔴 **`down`**: Inactivity exceeded timeout threshold (10 minutes).
- 🌍 **Custom Timezone Support**:
  - Configure your preferred timezone via `/settimezone <IANA Timezone>` (e.g. `Asia/Kolkata`, `UTC`).
  - All dashboard and alert timestamps are formatted according to your chosen timezone.
- 📢 **Pinned Channel Live Status Board**:
  - Link a public/private channel via `/setchannel <@channel or ID>`.
  - Automatically posts and pins a comprehensive status board.
  - **Change-Only Rule**: Message is **edited only when a service changes status** or is added/removed.
- 👥 **Group Alert Broadcasts**:
  - Link an alert group via `/setgroup` (executed inside the group).
  - Always posts a new alert message on outage and recovery events.
- 📱 **Direct User Alerts**:
  - Outage and recovery alerts are always sent directly to the creator's private Telegram DM.
- 🖥️ **Virtualizor VPS 514 Infrastructure Monitoring**:
  - Live power status, CPU usage %, RAM usage %, disk storage, bandwidth, and API latency.
  - **Direct Reachability Fallback**: Dual-layer verification with direct TCP/HTTP probing (ports 80, 443, 22, 25) preventing false alarms and accidental reboots when the Virtualizor control panel is unreachable.
  - Automated 1-minute cron polling on Cloudflare Workers edge.
  - Outage & recovery alerts dispatched to Telegram DM and linked groups.
  - Interactive bot controls: `/vps`, `/vps_specs`, `/start_vps`, `/restart_vps`, `/stop_vps` and `VPS 514 Live` menu button.
  - Real-time dark-mode glassmorphic Web UI at `/vps` and `/dashboard`.
- ⚡ **Cloudflare Workers, D1 & KV Architecture**:
  - Zero-maintenance serverless edge hosting with Cloudflare D1 (SQLite), KV (`VIRTUALIZOR_MONITOR_KV`), and 1-minute Cron Triggers.
  - Live Deployment: **[https://monitor-bot.nubcoders.workers.dev](https://monitor-bot.nubcoders.workers.dev)**

---

## 🛠️ Project Structure

```text
├── index.js          # Main Express server, Telegram bot, and health-check loop
├── package.json      # Dependencies and scripts
├── .env.example      # Sample environment variables
├── .env              # Your actual secrets (DO NOT commit)
├── test-server.js    # Automated test suite
├── test-ping.js      # Simulation script to test ping endpoints
└── README.md         # Documentation and setup guide
```

---

## 🚀 Setup & Installation

### 1. Prerequisites
- **Node.js** v18 or higher (Node 20+ recommended)
- **npm** v9 or higher
- A Telegram account

### 2. Clone and Install Dependencies

```bash
cd /root/Monitor-BOT
npm install
```

### 3. Telegram Configuration

1. **Create your Telegram Bot**:
   - Open Telegram and search for [@BotFather](https://t.me/BotFather).
   - Send `/newbot` and follow the prompts to choose a name and username.
   - Copy the HTTP API token provided by BotFather (e.g., `123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ`). This is your `TELEGRAM_BOT_TOKEN`.

2. **Find your Telegram Chat ID**:
   - Open Telegram and message [@userinfobot](https://t.me/userinfobot) or [@raw_data_bot](https://t.me/raw_data_bot).
   - It will reply with your numeric `Id` (e.g. `987654321`). This is your `MY_CHAT_ID`.
   - Send `/start` to your newly created bot so it has permission to message you.

### 4. Configure Environment Variables

Create your `.env` file by copying `.env.example`:

```bash
cp .env.example .env
```

Open `.env` and configure your settings:

```env
# Telegram Bot Credentials
TELEGRAM_BOT_TOKEN=123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ
MY_CHAT_ID=987654321

# Security Token (Monitored bots must provide this in POST /ping)
SECRET_TOKEN=my-super-secret-random-token-here

# Server Configuration
PORT=3000
HOST=127.0.0.1

# Monitored Bots (Comma-separated)
EXPECTED_BOTS=Bot B,Bot C,Bot D

# Thresholds (Optional customizations)
CHECK_INTERVAL_MS=60000        # Health check interval (1 minute)
TIMEOUT_THRESHOLD_MS=600000    # Inactivity timeout (10 minutes)
ENABLE_RECOVERY_ALERTS=true    # Notify when a bot recovers
```

---

## 🏃 Running the Application

### Start Bot A

```bash
npm start
```

You will see:
```text
[Registry] Pre-registered monitored bot: "Bot B"
[Registry] Pre-registered monitored bot: "Bot C"
[Registry] Pre-registered monitored bot: "Bot D"
[Telegram] Bot A successfully connected to Telegram API.
[Health Check] Background loop scheduled to run every 60s (Timeout threshold: 600s)
====================================================
🚀 Bot A Monitoring Server listening on 127.0.0.1:3000
   POST http://127.0.0.1:3000/ping
   GET  http://127.0.0.1:3000/status
====================================================
```

### Run Automated Tests

To test endpoint authentication, outage detection, and recovery logic without sending external Telegram calls:

```bash
npm test
```

### Run Ping Simulation

To test pinging from another terminal:

```bash
npm run test:ping
```

---

## 📡 API Endpoints

### 1. `POST /ping` — Report Bot Heartbeat

Monitored bots send a heartbeat to this endpoint.

- **URL**: `/ping`
- **Method**: `POST`
- **Headers**: `Content-Type: application/json`
- **Body**:
  ```json
  {
    "bot_name": "Bot B",
    "secret_token": "my-super-secret-random-token-here"
  }
  ```

#### Responses:
- **`200 OK`**:
  ```json
  {
    "status": "success",
    "message": "Heartbeat acknowledged for Bot B",
    "timestamp": 1726567890123
  }
  ```
- **`403 Forbidden`** (Invalid or missing `secret_token`):
  ```json
  {
    "error": "Forbidden: Invalid or missing secret_token"
  }
  ```
- **`400 Bad Request`** (Missing or invalid `bot_name`):
  ```json
  {
    "error": "Bad Request: \"bot_name\" must be a non-empty string"
  }
  ```

---

### 2. `GET /status` — Service Overview

Returns the health status and last check-in times of all bots.

- **URL**: `/status`
- **Method**: `GET`

#### Example Response:
```json
{
  "service": "Bot A Monitor",
  "uptime_seconds": 320,
  "check_interval_ms": 60000,
  "timeout_threshold_ms": 600000,
  "bots": [
    {
      "bot_name": "Bot B",
      "status": "healthy",
      "last_ping": "2026-09-17T10:11:45.852Z",
      "minutes_since_ping": 2,
      "alert_sent": false
    },
    {
      "bot_name": "Bot C",
      "status": "down",
      "last_ping": "2026-09-17T09:55:00.000Z",
      "minutes_since_ping": 18,
      "alert_sent": true
    }
  ]
}
```

---

## 💻 Client Integration Examples (For Bot B, C, D)

How downstream bots can report their heartbeat to Bot A:

### 1. cURL Example
```bash
curl -X POST http://127.0.0.1:3000/ping \
  -H "Content-Type: application/json" \
  -d '{"bot_name": "Bot B", "secret_token": "my-super-secret-random-token-here"}'
```

### 2. Node.js Client Example
```javascript
// Add this heartbeat loop in Bot B / C / D
const MONITOR_URL = 'http://127.0.0.1:3000/ping';
const BOT_NAME = 'Bot B';
const SECRET_TOKEN = process.env.MONITOR_SECRET_TOKEN;

async function sendHeartbeat() {
  try {
    const res = await fetch(MONITOR_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bot_name: BOT_NAME, secret_token: SECRET_TOKEN })
    });
    const data = await res.json();
    console.log('[Heartbeat sent]:', data.status);
  } catch (err) {
    console.error('[Heartbeat failed]:', err.message);
  }
}

// Send heartbeat every 3 minutes
setInterval(sendHeartbeat, 3 * 60 * 1000);
sendHeartbeat();
```

### 3. Python Client Example
```python
import time
import requests

MONITOR_URL = "http://127.0.0.1:3000/ping"
BOT_NAME = "Bot C"
SECRET_TOKEN = "my-super-secret-random-token-here"

def send_heartbeat():
    try:
        payload = {"bot_name": BOT_NAME, "secret_token": SECRET_TOKEN}
        r = requests.post(MONITOR_URL, json=payload, timeout=5)
        print(f"Heartbeat response: {r.status_code}")
    except Exception as e:
        print(f"Heartbeat failed: {e}")

while True:
    send_heartbeat()
    time.sleep(180)  # Ping every 3 minutes
```

---

## 🔔 Telegram Alerts Preview

### Outage Alert (Sent once when inactivity > 10m):
```text
🚨 [ALERT] Bot Unresponsive!

🤖 Bot: Bot B
⏱️ Time Since Last Ping: 11 minutes (exceeds 10m threshold)
🕒 Last Seen: Thu, 17 Sep 2026 10:00:00 GMT

⚠️ Action: Please inspect the bot server process or logs immediately.
```

### Recovery Notification (Sent when bot resumes pinging):
```text
✅ [RECOVERY] Bot Bot B has checked in and is back online!
🕒 Timestamp: Thu, 17 Sep 2026 10:15:20 GMT
```

---

## 🛡️ Production Deployment Options

### Option 1: Cloudflare Workers (Serverless & Free Tier)

Deploy Bot A globally on **Cloudflare Workers** with **Cloudflare D1** (Serverless SQLite) and **Cron Triggers**:

1. **Log in to Cloudflare**:
   ```bash
   npx wrangler login
   ```

2. **Create your Cloudflare D1 Database**:
   ```bash
   npm run db:create
   ```
   *Copy the returned `database_id` and paste it into [`wrangler.jsonc`](wrangler.jsonc) under `d1_databases[0].database_id`.*

3. **Initialize the remote database schema**:
   ```bash
   npm run db:migrate:remote
   ```

4. **Set Production Secrets on Cloudflare**:
   ```bash
   npx wrangler secret put SECRET_TOKEN
   npx wrangler secret put TELEGRAM_BOT_TOKEN
   npx wrangler secret put MY_CHAT_ID
   ```

5. **Deploy the Worker**:
   ```bash
   npm run worker:deploy
   ```

6. **Connect your Telegram Webhook**:
   ```bash
   curl -F "url=https://<your-worker-subdomain>.workers.dev/webhook" \
     https://api.telegram.org/bot<YOUR_TELEGRAM_BOT_TOKEN>/setWebhook
   ```

*(For local testing with Wrangler, run `npm run worker:dev` and `node test-worker.js`)*

---

### Option 2: Traditional Server / VPS / PM2

1. **Process Manager**: Use [PM2](https://pm2.keymetrics.io/) to keep Bot A running continuously:
   ```bash
   npm install -g pm2
   pm2 start index.js --name "bot-a-monitor"
   pm2 save
   pm2 startup
   ```
2. **Reverse Proxy & HTTPS**: If deploying on a VPS or public server, place Bot A behind Nginx or Caddy with SSL/TLS encryption.

