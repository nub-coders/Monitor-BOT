/**
 * scripts/setup-bot-profile.js
 * 
 * Registers bot commands, description, and short description on Telegram.
 * Run with: npm run bot:setup
 */

require('dotenv').config();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error('❌ Missing TELEGRAM_BOT_TOKEN in .env');
  process.exit(1);
}

const commands = [
  { command: 'start', description: 'Open dashboard and main menu' },
  { command: 'newservice', description: 'Add a new service & get secret token' },
  { command: 'services', description: 'List all your services and tokens' },
  { command: 'status', description: 'View live health status' },
  { command: 'setchannel', description: 'Link channel for pinned dashboard' },
  { command: 'unsetchannel', description: 'Unlink current channel' },
  { command: 'setgroup', description: 'Link group for outage alerts' },
  { command: 'settimezone', description: 'Set your timezone (e.g. Asia/Kolkata)' },
  { command: 'delete', description: 'Delete a service (/delete <name>)' },
  { command: 'cancel', description: 'Cancel active prompt' }
];

async function tgPost(method, body) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return res.json();
}

async function main() {
  console.log('🤖 Setting up Telegram Bot Commands & Profile...');

  // 1. Set Commands
  const cmdRes = await tgPost('setMyCommands', { commands });
  console.log('-> setMyCommands:', cmdRes.ok ? '✅ Success' : cmdRes.description);

  // 2. Set Description
  const descRes = await tgPost('setMyDescription', {
    description: '🤖 Professional 24/7 Monitoring Bot\n\nMonitor your downstream bots, APIs, and microservices with instant Telegram alerts, live pinned channel dashboards, and group notifications.\n\nUse /start to begin.'
  });
  console.log('-> setMyDescription:', descRes.ok ? '✅ Success' : descRes.description);

  // 3. Set Short Description
  const shortRes = await tgPost('setMyShortDescription', {
    short_description: '24/7 edge monitoring with instant outage alerts and live pinned channel dashboards.'
  });
  console.log('-> setMyShortDescription:', shortRes.ok ? '✅ Success' : shortRes.description);

  // 4. Ensure Webhook points to Cloudflare Worker
  const WORKER_URL = 'https://monitor-bot.nubcoders.workers.dev/webhook';
  const hookRes = await tgPost('setWebhook', { url: WORKER_URL });
  console.log('-> setWebhook:', hookRes.ok ? '✅ Success (' + WORKER_URL + ')' : hookRes.description);

  console.log('\n✨ Bot profile & commands configured successfully!\n');
}

main().catch(err => {
  console.error('Error setting up bot profile:', err.message);
  process.exit(1);
});
