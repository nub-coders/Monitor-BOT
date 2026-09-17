/**
 * Bot A - Central Monitoring Web Server & Telegram Alert Bot
 * 
 * Features:
 * 1. Express Web Server:
 *    - POST /ping: Receives heartbeats from downstream bots (e.g., Bot B, C, D)
 *    - Validates shared secret_token using timing-safe comparison.
 *    - Updates in-memory heartbeat timestamps and clears alert state.
 *    - GET /status: Returns JSON health status of all monitored bots.
 * 
 * 2. Background Health Check Loop:
 *    - Periodically inspects all registered bots every 1 minute.
 *    - Dispatches Telegram alert if last ping exceeds 10 minutes (only once per outage).
 *    - Optionally sends a recovery notification once an alerted bot reconnects.
 * 
 * 3. Telegram Interactive Bot:
 *    - Delivers alerts to configured MY_CHAT_ID.
 *    - Supports /status command to inspect bot states directly in Telegram.
 */

require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const { Bot } = require('grammy');

// ==========================================
// 1. Environment & Configuration
// ==========================================
const PORT = parseInt(process.env.PORT, 10) || 3000;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const MY_CHAT_ID = process.env.MY_CHAT_ID;
const SECRET_TOKEN = process.env.SECRET_TOKEN;

// 1 minute check interval (60,000 ms)
const CHECK_INTERVAL_MS = parseInt(process.env.CHECK_INTERVAL_MS, 10) || 60 * 1000;

// 10 minutes timeout threshold (600,000 ms)
const TIMEOUT_THRESHOLD_MS = parseInt(process.env.TIMEOUT_THRESHOLD_MS, 10) || 10 * 60 * 1000;

// Whether to send recovery alerts when a down bot recovers
const ENABLE_RECOVERY_ALERTS = process.env.ENABLE_RECOVERY_ALERTS !== 'false';

// Validate critical configuration on startup
if (!SECRET_TOKEN) {
  console.error('[CRITICAL] SECRET_TOKEN is not defined in environment variables! Exiting...');
  process.exit(1);
}

if (!TELEGRAM_BOT_TOKEN) {
  console.warn('[WARNING] TELEGRAM_BOT_TOKEN is missing. Telegram messaging will be disabled.');
}

if (!MY_CHAT_ID) {
  console.warn('[WARNING] MY_CHAT_ID is missing. Telegram alerts will not have a target recipient.');
}

// ==========================================
// 2. In-Memory Bot Registry Store
// ==========================================
/**
 * Map structure:
 * bot_name -> {
 *   name: string,
 *   lastPing: number,       // Timestamp in milliseconds
 *   alertSent: boolean,     // True if down-alert has already been dispatched for current outage
 *   status: 'healthy'|'down'
 * }
 */
const botRegistry = new Map();

// Pre-populate expected bots if provided in .env (e.g. "Bot B,Bot C,Bot D")
const expectedBotsEnv = process.env.EXPECTED_BOTS || 'Bot B,Bot C,Bot D';
if (expectedBotsEnv) {
  expectedBotsEnv.split(',').forEach((name) => {
    const trimmed = name.trim();
    if (trimmed) {
      botRegistry.set(trimmed, {
        name: trimmed,
        lastPing: Date.now(), // Initialize with current startup timestamp
        alertSent: false,
        status: 'healthy'
      });
      console.log(`[Registry] Pre-registered monitored bot: "${trimmed}"`);
    }
  });
}

// ==========================================
// 3. Telegram Bot Setup (grammY)
// ==========================================
let bot = null;

if (TELEGRAM_BOT_TOKEN) {
  bot = new Bot(TELEGRAM_BOT_TOKEN);

  // Global error handler for grammY
  bot.catch((err) => {
    console.error('[Telegram Error]:', err.message || err);
  });

  // Bot command: /start or /help
  bot.command(['start', 'help'], async (ctx) => {
    await ctx.reply(
      '🤖 *Bot A Monitoring Service*\n\n' +
      'Available commands:\n' +
      '• `/status` - View current health status of all monitored bots\n' +
      '• `/ping` - Check if Bot A is online',
      { parse_mode: 'Markdown' }
    );
  });

  // Bot command: /ping
  bot.command('ping', async (ctx) => {
    await ctx.reply('🏓 Pong! Bot A monitoring server is up and running.');
  });

  // Bot command: /status - Inspect all monitored bots
  bot.command('status', async (ctx) => {
    if (botRegistry.size === 0) {
      return ctx.reply('ℹ️ No bots currently registered in the monitoring registry.');
    }

    const now = Date.now();
    let message = '📊 *Bot Monitoring Status:*\n\n';

    botRegistry.forEach((info) => {
      const elapsedMinutes = Math.floor((now - info.lastPing) / 60000);
      const icon = info.status === 'healthy' ? '🟢' : '🔴';
      const lastSeen = new Date(info.lastPing).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      
      message += `${icon} *${escapeMarkdown(info.name)}*\n`;
      message += `   • Status: ${info.status.toUpperCase()}\n`;
      message += `   • Last Check-in: ${lastSeen} (${elapsedMinutes}m ago)\n`;
      message += `   • Outage Alert Sent: ${info.alertSent ? 'Yes' : 'No'}\n\n`;
    });

    await ctx.reply(message, { parse_mode: 'Markdown' });
  });

  function startBot() {
    if (bot && !bot.isRunning()) {
      bot.start({
        onStart: (botInfo) => {
          console.log(`[Telegram] Bot A successfully connected to Telegram as @${botInfo.username}`);
        }
      }).catch((err) => {
        console.error('[Telegram] Failed to start Telegram bot polling:', err.message);
      });
    }
  }

  if (require.main === module) {
    startBot();
  }
}

/**
 * Helper to escape Telegram Markdown special characters
 */
function escapeMarkdown(text) {
  return String(text).replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

/**
 * Dispatch an alert message to the configured Telegram chat ID
 */
async function sendTelegramAlert(message) {
  if (!bot) {
    console.warn(`[Telegram Alert Skipped - Bot unconfigured]:\n${message}`);
    return;
  }
  if (!MY_CHAT_ID) {
    console.warn(`[Telegram Alert Skipped - MY_CHAT_ID missing]:\n${message}`);
    return;
  }

  try {
    // In grammY, direct API calls use bot.api.sendMessage
    await bot.api.sendMessage(MY_CHAT_ID, message, { parse_mode: 'Markdown' });
    console.log(`[Telegram] Alert dispatched to chat ${MY_CHAT_ID}`);
  } catch (error) {
    console.error(`[Telegram Error] Failed to send message to chat ${MY_CHAT_ID}:`, error.message);
  }
}

// ==========================================
// 4. Express Web Server & Endpoints
// ==========================================
const app = express();

// Middleware: parse incoming JSON requests (restricted to 10kb to avoid DoS)
app.use(express.json({ limit: '10kb' }));

// Security headers middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cache-Control', 'no-store');
  next();
});

/**
 * Timing-safe comparison to prevent timing attacks on SECRET_TOKEN
 */
function isValidSecretToken(providedToken, expectedToken) {
  if (typeof providedToken !== 'string' || typeof expectedToken !== 'string') {
    return false;
  }
  const providedBuffer = Buffer.from(providedToken);
  const expectedBuffer = Buffer.from(expectedToken);

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

/**
 * POST /ping
 * Endpoint for downstream bots to report heartbeats.
 * 
 * Body: { "bot_name": "Bot B", "secret_token": "..." }
 */
app.post('/ping', async (req, res) => {
  const { bot_name, secret_token } = req.body || {};

  // 1. Validate Secret Token
  if (!isValidSecretToken(secret_token, SECRET_TOKEN)) {
    return res.status(403).json({
      error: 'Forbidden: Invalid or missing secret_token'
    });
  }

  // 2. Validate Bot Name
  if (!bot_name || typeof bot_name !== 'string' || !bot_name.trim()) {
    return res.status(400).json({
      error: 'Bad Request: "bot_name" must be a non-empty string'
    });
  }

  const cleanBotName = bot_name.trim();
  const now = Date.now();

  // 3. Update or Register Bot in Registry
  let existingRecord = botRegistry.get(cleanBotName);
  const wasInOutage = existingRecord && (existingRecord.alertSent || existingRecord.status === 'down');

  if (existingRecord) {
    existingRecord.lastPing = now;
    existingRecord.alertSent = false;
    existingRecord.status = 'healthy';
  } else {
    existingRecord = {
      name: cleanBotName,
      lastPing: now,
      alertSent: false,
      status: 'healthy'
    };
    botRegistry.set(cleanBotName, existingRecord);
  }

  console.log(`[Ping] Received heartbeat from "${cleanBotName}" at ${new Date(now).toISOString()}`);

  // 4. Send Recovery Notification if Bot was previously down/alerted
  if (wasInOutage && ENABLE_RECOVERY_ALERTS) {
    const recoveryMsg =
      `✅ *[RECOVERY]* Bot *${escapeMarkdown(cleanBotName)}* has checked in and is back online!\n` +
      `🕒 *Timestamp:* \`${new Date(now).toUTCString()}\``;
    sendTelegramAlert(recoveryMsg);
  }

  return res.status(200).json({
    status: 'success',
    message: `Heartbeat acknowledged for ${cleanBotName}`,
    timestamp: now
  });
});

/**
 * GET /status
 * Returns current status of all monitored bots and server uptime.
 */
app.get('/status', (req, res) => {
  const now = Date.now();
  const bots = [];

  botRegistry.forEach((val) => {
    const elapsedMs = now - val.lastPing;
    bots.push({
      bot_name: val.name,
      status: val.status,
      last_ping: new Date(val.lastPing).toISOString(),
      minutes_since_ping: Math.round(elapsedMs / 60000),
      alert_sent: val.alertSent
    });
  });

  res.status(200).json({
    service: 'Bot A Monitor',
    uptime_seconds: Math.floor(process.uptime()),
    check_interval_ms: CHECK_INTERVAL_MS,
    timeout_threshold_ms: TIMEOUT_THRESHOLD_MS,
    bots
  });
});

// Root endpoint for simple health check
app.get('/', (req, res) => {
  res.status(200).send('Bot A Monitoring Server is running.');
});

// ==========================================
// 5. Background Health Check Loop
// ==========================================
function checkBotsHealth() {
  const now = Date.now();

  botRegistry.forEach((botInfo, botKey) => {
    const elapsedMs = now - botInfo.lastPing;

    // Check if inactivity exceeds timeout threshold (10 minutes default)
    if (elapsedMs > TIMEOUT_THRESHOLD_MS) {
      botInfo.status = 'down';

      // Send alert only once per outage
      if (!botInfo.alertSent) {
        const elapsedMinutes = Math.round(elapsedMs / 60000);
        const lastSeenDate = new Date(botInfo.lastPing).toUTCString();

        const alertMessage =
          `🚨 *[ALERT] Bot Unresponsive!*\n\n` +
          `🤖 *Bot:* \`${escapeMarkdown(botInfo.name)}\`\n` +
          `⏱️ *Time Since Last Ping:* \`${elapsedMinutes} minutes\` (exceeds ${Math.round(TIMEOUT_THRESHOLD_MS / 60000)}m threshold)\n` +
          `🕒 *Last Seen:* \`${lastSeenDate}\`\n\n` +
          `⚠️ *Action:* Please inspect the bot server process or logs immediately.`;

        console.warn(`[Health Check Alert] Bot "${botInfo.name}" exceeded timeout (${elapsedMinutes}m). Dispatching Telegram alert.`);
        
        sendTelegramAlert(alertMessage);
        botInfo.alertSent = true; // Prevent repeat alerts for the same outage
      }
    }
  });
}

let healthCheckInterval = null;
let server = null;

function startHealthCheck() {
  if (!healthCheckInterval) {
    healthCheckInterval = setInterval(checkBotsHealth, CHECK_INTERVAL_MS);
    console.log(`[Health Check] Background loop scheduled to run every ${CHECK_INTERVAL_MS / 1000}s (Timeout threshold: ${TIMEOUT_THRESHOLD_MS / 1000}s)`);
  }
  return healthCheckInterval;
}

function stopHealthCheck() {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }
}

// ==========================================
// 6. Server Initialization & Graceful Shutdown
// ==========================================
const HOST = process.env.HOST || '127.0.0.1';

function startServer(port = PORT, host = HOST) {
  startHealthCheck();
  server = app.listen(port, host, () => {
    console.log(`====================================================`);
    console.log(`🚀 Bot A Monitoring Server listening on ${host}:${port}`);
    console.log(`   POST http://${host}:${port}/ping`);
    console.log(`   GET  http://${host}:${port}/status`);
    console.log(`====================================================`);
  });
  return server;
}

// Graceful termination handling
function shutdown(signal = 'SIGTERM') {
  console.log(`\n[Shutdown] Received ${signal}. Closing resources cleanly...`);
  stopHealthCheck();

  if (server) {
    server.close(async () => {
      console.log('[Shutdown] Express HTTP server closed.');
      if (bot) {
        try {
          await bot.stop();
          console.log('[Shutdown] Telegram bot stopped.');
        } catch (err) {
          console.error('[Shutdown Error] grammY stop error:', err.message);
        }
      }
      if (require.main === module) {
        process.exit(0);
      }
    });
  }
}

if (require.main === module) {
  startServer();
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

module.exports = {
  app,
  botRegistry,
  checkBotsHealth,
  isValidSecretToken,
  startServer,
  shutdown,
  startHealthCheck,
  stopHealthCheck
};

