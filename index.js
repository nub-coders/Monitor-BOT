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
const { VirtualizorClient } = require('./lib/virtualizor');

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

// VPS Auto-restart configuration
const ENABLE_VPS_AUTO_START = process.env.ENABLE_VPS_AUTO_START === 'true';
const VPS_MAX_RESTART_ATTEMPTS = parseInt(process.env.VPS_MAX_RESTART_ATTEMPTS, 10) || 3;

// Virtualizor Configuration
const PANEL_URL = process.env.PANEL_URL || 'https://arjun.defaultserverdns.com:4083';
const VPS_ID = process.env.VPS_ID || '514';
const VIRTUALIZOR_API_KEY = process.env.VIRTUALIZOR_API_KEY || '';
const VIRTUALIZOR_API_PASS = process.env.VIRTUALIZOR_API_PASS || '';
const vpsClient = new VirtualizorClient({
  panelUrl: PANEL_URL,
  apiKey: VIRTUALIZOR_API_KEY,
  apiPass: VIRTUALIZOR_API_PASS,
  vpsId: VPS_ID
});

// Prioritize explicit custom domain or BASE_URL over Render's default *.onrender.com URL
const explicitCustomDomain = process.env.CUSTOM_DOMAIN || process.env.BASE_URL || null;
let detectedPublicUrl = explicitCustomDomain || process.env.RENDER_EXTERNAL_URL || null;

if (detectedPublicUrl && !detectedPublicUrl.startsWith('http://') && !detectedPublicUrl.startsWith('https://')) {
  detectedPublicUrl = `https://${detectedPublicUrl}`;
}

const hasExplicitDomain = Boolean(explicitCustomDomain);

function getPublicUrl() {
  return detectedPublicUrl || `http://localhost:${PORT}`;
}

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

// ==========================================
// VPS Auto-Restart State
// ==========================================
let vpsRestartAttempts = 0;   // How many restart attempts have been made this outage
let vpsGaveUp = false;         // True after maxAttempts exhausted — stop retrying

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
    const error = err.error || err;
    if (error && error.error_code === 409) {
      console.warn('[Telegram] Polling conflict detected (another instance is shutting down).');
      return;
    }
    console.error('[Telegram Error]:', error.message || error);
  });

  // Bot command: /start or /help
  bot.command(['start', 'help'], async (ctx) => {
    const currentUrl = getPublicUrl();
    await ctx.reply(
      '🤖 *Bot A Monitoring Service*\n\n' +
      `🌐 *Public URL:* \`${currentUrl}\`\n` +
      `📡 *Heartbeat Ping URL:* \`${currentUrl}/ping\`\n\n` +
      'Available commands:\n' +
      '• `/status` - View health status of monitored bots\n' +
      '• `/vps` - Check VPS status and telemetry\n' +
      '• `/url` - Show public heartbeat endpoints\n' +
      '• `/ping` - Check if Bot A is online',
      { parse_mode: 'Markdown' }
    );
  });

  // Bot command: /url
  bot.command(['url', 'endpoint'], async (ctx) => {
    const currentUrl = getPublicUrl();
    await ctx.reply(
      '🌐 *Bot A Endpoints:*\n\n' +
      `• *Base URL:* \`${currentUrl}\`\n` +
      `• *POST Ping:* \`${currentUrl}/ping\`\n` +
      `• *GET Status:* \`${currentUrl}/status\``,
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

  // Bot command: /vps or /vps_status - Inspect Virtualizor VPS 514
  bot.command(['vps', 'vps_status'], async (ctx) => {
    if (!VIRTUALIZOR_API_KEY || !VIRTUALIZOR_API_PASS) {
      return ctx.reply(
        `🖥️ *Virtualizor VPS ${VPS_ID}*\n\n` +
        `• *Hostname:* \`${process.env.VPS_HOSTNAME || 'mails.nubcoders.com'}\`\n` +
        `• *IP:* \`${process.env.VPS_IP || '103.190.93.162'}\`\n` +
        `• *Status:* 🟢 Configured\n\n` +
        `_Set VIRTUALIZOR_API_KEY & PASS in .env for live API telemetry._`,
        { parse_mode: 'Markdown' }
      );
    }

    try {
      const info = await vpsClient.getVpsInfo();
      const icon = info.isOnline ? '🟢' : '🔴';
      const autoStartStatus = ENABLE_VPS_AUTO_START ? '✅ Enabled' : '❌ Disabled';
      const msg =
        `🖥️ *VPS ${VPS_ID} Live Telemetry*\n\n` +
        `• *Status:* ${icon} *${info.isOnline ? 'ONLINE' : 'OFFLINE'}*\n` +
        `• *Hostname:* \`${info.hostname}\`\n` +
        `• *IP:* \`${info.ip}\`\n` +
        `• *CPU Usage:* \`${info.cpuUsagePercent.toFixed(1)}%\` (${info.cores} cores)\n` +
        `• *RAM:* \`${(info.ramUsedMb / 1024).toFixed(1)} GB / ${(info.ramTotalMb / 1024).toFixed(0)} GB\` (${info.ramUsagePercent}%)\n` +
        `• *Storage:* \`${info.diskUsedGb} GB / ${info.diskTotalGb} GB\`\n` +
        `• *Bandwidth:* \`${info.bandwidthUsedGb.toFixed(2)} GB\`\n` +
        `• *Latency:* \`${info.responseTimeMs}ms\`\n\n` +
        `_Auto-start: ${autoStartStatus}_`;
      await ctx.reply(msg, { parse_mode: 'Markdown' });
    } catch (err) {
      await ctx.reply(`❌ *VPS Status Error:* ${escapeMarkdown(err.message)}`, { parse_mode: 'Markdown' });
    }
  });

  // Bot command: /start_vps - Manually trigger VPS power-on
  bot.command('start_vps', async (ctx) => {
    if (!VIRTUALIZOR_API_KEY || !VIRTUALIZOR_API_PASS) {
      return ctx.reply(
        `⚠️ *VPS Control Unavailable*\n\n` +
        `_Set VIRTUALIZOR_API_KEY & VIRTUALIZOR_API_PASS in .env to enable VPS management._`,
        { parse_mode: 'Markdown' }
      );
    }

    try {
      await ctx.reply(
        `⏳ *Starting VPS ${VPS_ID}*...\n\n` +
        `Please wait a moment for the power-on command to be processed.`,
        { parse_mode: 'Markdown' }
      );

      const result = await vpsClient.start();

      if (result?.data?.vpsid === VPS_ID || result?.status === 'success') {
        await ctx.reply(
          `✅ *VPS ${VPS_ID} Start Initiated*\n\n` +
          `The power-on command was sent successfully.\n` +
          `🕒 *Time:* \`${new Date().toUTCString()}\`\n\n` +
          `💡 *Note:* The VPS may take a few minutes to boot up. Use /vps to check status.`,
          { parse_mode: 'Markdown' }
        );
      } else {
        throw new Error(`Unexpected response: ${JSON.stringify(result?.data || result)}`);
      }
    } catch (err) {
      await ctx.reply(
        `❌ *VPS Start Failed*\n\n` +
        `Error: ${escapeMarkdown(err.message)}\n\n` +
        `Please check the Virtualizor panel or API credentials.`,
        { parse_mode: 'Markdown' }
      );
    }
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

app.set('trust proxy', 1);

// Middleware: parse incoming JSON requests (restricted to 10kb to avoid DoS)
app.use(express.json({ limit: '10kb' }));

// Security headers and dynamic public URL detection middleware
app.use((req, res, next) => {
  if (!hasExplicitDomain) {
    const host = req.get('x-forwarded-host') || req.get('host');
    const proto = req.get('x-forwarded-proto') || req.protocol;
    if (host && !host.startsWith('localhost') && !host.startsWith('127.0.0.1')) {
      const currentHostIsDefault = detectedPublicUrl && detectedPublicUrl.includes('.onrender.com');
      const incomingIsCustom = !host.includes('.onrender.com');

      // Update URL if none is set yet, or if a custom domain request arrives to upgrade from default *.onrender.com
      if (!detectedPublicUrl || (currentHostIsDefault && incomingIsCustom)) {
        detectedPublicUrl = `${proto}://${host}`;
        console.log(`[Auto-Detect] Public URL updated to custom domain: ${detectedPublicUrl}`);
      }
    }
  }
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
  let healthyCount = 0;
  let downCount = 0;

  botRegistry.forEach((val) => {
    const elapsedMs = now - val.lastPing;
    if (val.status === 'healthy') healthyCount++;
    else downCount++;
    bots.push({
      bot_name: val.name,
      status: val.status,
      last_ping: new Date(val.lastPing).toISOString(),
      minutes_since_ping: Math.round(elapsedMs / 60000),
      alert_sent: val.alertSent
    });
  });

  res.status(200).json({
    service: 'Bot A Monitoring Service',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    total_bots: botRegistry.size,
    healthy_bots: healthyCount,
    down_bots: downCount,
    bots
  });
});

/**
 * GET /api/vps-status
 * Live Virtualizor VPS 514 metrics
 */
app.get('/api/vps-status', async (req, res) => {
  if (!VIRTUALIZOR_API_KEY || !VIRTUALIZOR_API_PASS) {
    return res.json({
      isOnline: true,
      vpsId: VPS_ID,
      hostname: process.env.VPS_HOSTNAME || 'mails.nubcoders.com',
      ip: process.env.VPS_IP || '103.190.93.162',
      status: 'configured',
      message: 'Configure VIRTUALIZOR_API_KEY and VIRTUALIZOR_API_PASS in .env for live metrics'
    });
  }

  try {
    const info = await vpsClient.getVpsInfo();
    res.json(info);
  } catch (err) {
    res.status(500).json({ isOnline: false, error: err.message });
  }
});

// Root endpoint for simple health check
app.get('/', (req, res) => {
  res.status(200).send('Bot A Monitoring Server is running.');
});

// ==========================================
// 5. Background Health Check Loop
// ==========================================
async function checkBotsHealth() {
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

  // VPS Auto-Restart Logic
  if (ENABLE_VPS_AUTO_START && VIRTUALIZOR_API_KEY && VIRTUALIZOR_API_PASS) {
    try {
      const vpsStatus = await vpsClient.getStatus();

      if (!vpsStatus.isOnline) {
        if (vpsGaveUp) {
          // Already exhausted all attempts — stay silent
          console.log(`[VPS Monitor] VPS ${VPS_ID} still offline. Max attempts reached. Waiting for manual fix.`);
        } else if (vpsRestartAttempts < VPS_MAX_RESTART_ATTEMPTS) {
          vpsRestartAttempts++;
          console.log(`[VPS Monitor] VPS ${VPS_ID} offline — restart attempt ${vpsRestartAttempts}/${VPS_MAX_RESTART_ATTEMPTS}`);
          await triggerVPSAutoRestart();

          if (vpsRestartAttempts >= VPS_MAX_RESTART_ATTEMPTS) {
            vpsGaveUp = true;
            console.log(`[VPS Monitor] VPS ${VPS_ID} — max restart attempts (${VPS_MAX_RESTART_ATTEMPTS}) reached. Giving up.`);
            sendTelegramAlert(
              `🔴 *VPS ${VPS_ID} — Max Restart Attempts Reached*\n\n` +
              `📊 *Attempts Made:* ${vpsRestartAttempts}/${VPS_MAX_RESTART_ATTEMPTS}\n\n` +
              `_VPS did not recover. Manual intervention required. Check the Virtualizor panel._`
            );
          }
        }
      } else {
        // VPS is online — reset retry state
        if (vpsRestartAttempts > 0 || vpsGaveUp) {
          console.log(`[VPS Monitor] VPS ${VPS_ID} is back online. Resetting restart state.`);
          sendTelegramAlert(
            `✅ *[RECOVERY]* VPS ${VPS_ID} is back ONLINE!\n\n` +
            `🕒 *Timestamp:* \`${new Date(now).toUTCString()}\`\n` +
            `📊 *Restart Attempts Used:* ${vpsRestartAttempts}/${VPS_MAX_RESTART_ATTEMPTS}`
          );
        }
        vpsRestartAttempts = 0;
        vpsGaveUp = false;
      }
    } catch (err) {
      console.error(`[VPS Monitor] Error checking VPS status:`, err.message);
    }
  }
}

async function triggerVPSAutoRestart() {
  console.log(`[VPS Monitor] Initiating restart attempt ${vpsRestartAttempts}/${VPS_MAX_RESTART_ATTEMPTS} for VPS ${VPS_ID}...`);

  sendTelegramAlert(
    `🔄 *[AUTO-RESTART]* VPS ${VPS_ID} — Attempt ${vpsRestartAttempts}/${VPS_MAX_RESTART_ATTEMPTS}\n\n` +
    `⏱️ *Triggered:* \`${new Date().toUTCString()}\`\n\n` +
    `_Attempting restart via Virtualizor API..._`
  );

  try {
    await vpsClient.restart();
    console.log(`[VPS Monitor] Restart command sent for VPS ${VPS_ID} (attempt ${vpsRestartAttempts})`);
    sendTelegramAlert(
      `✅ *VPS ${VPS_ID} Restart Dispatched (Attempt ${vpsRestartAttempts}/${VPS_MAX_RESTART_ATTEMPTS})*\n\n` +
      `🕒 *Time:* \`${new Date().toUTCString()}\`\n\n` +
      `_Use /vps in a few minutes to check if it recovered._`
    );
  } catch (err) {
    console.error(`[VPS Monitor] Restart attempt ${vpsRestartAttempts} failed:`, err.message);
    sendTelegramAlert(
      `❌ *VPS ${VPS_ID} Restart Failed (Attempt ${vpsRestartAttempts}/${VPS_MAX_RESTART_ATTEMPTS})*\n\n` +
      `❌ *Error:* ${escapeMarkdown(err.message)}`
    );
  }
}

let healthCheckInterval = null;
let server = null;

function startHealthCheck() {
  if (!healthCheckInterval) {
    // Run health check immediately on start, then interval
    checkBotsHealth().catch(err => console.error('[Health Check] Initial check failed:', err));
    healthCheckInterval = setInterval(() => {
      checkBotsHealth().catch(err => console.error('[Health Check] Interval check failed:', err));
    }, CHECK_INTERVAL_MS);
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
// Force 0.0.0.0 for cloud environments (Render, Railway, Docker)
// Even if HOST=127.0.0.1 was set in environment variables, enforce 0.0.0.0
const HOST = (process.env.NODE_ENV === 'test' && process.env.HOST) ? process.env.HOST : '0.0.0.0';

function startServer(port = PORT, host = HOST) {
  startHealthCheck();
  server = app.listen(port, host, () => {
    const url = getPublicUrl();
    console.log(`====================================================`);
    console.log(`🚀 Bot A Monitoring Server listening on ${host}:${port}`);
    console.log(`   Public Web URL: ${url}`);
    console.log(`   POST ${url}/ping`);
    console.log(`   GET  ${url}/status`);
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
  stopHealthCheck,
  getPublicUrl
};

