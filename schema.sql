-- Cloudflare D1 Database Schema for Monitor-BOT

-- Users / Bot Connectors
CREATE TABLE IF NOT EXISTS users (
  telegram_id INTEGER PRIMARY KEY,
  first_name TEXT,
  username TEXT,
  channel_id TEXT,
  channel_msg_id INTEGER,
  group_id TEXT,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  conv_state TEXT,
  created_at INTEGER NOT NULL
);

-- Monitored Services
CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  secret_token TEXT UNIQUE NOT NULL,
  last_ping INTEGER DEFAULT NULL,
  status TEXT NOT NULL DEFAULT 'initialized', -- 'initialized' | 'up' | 'down'
  last_status TEXT NOT NULL DEFAULT 'initialized',
  alert_sent INTEGER NOT NULL DEFAULT 0,
  timeout_minutes INTEGER NOT NULL DEFAULT 10,
  created_at INTEGER NOT NULL,
  UNIQUE(user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_services_user ON services(user_id);
CREATE INDEX IF NOT EXISTS idx_services_token ON services(secret_token);
CREATE INDEX IF NOT EXISTS idx_services_status ON services(status);
