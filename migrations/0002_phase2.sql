ALTER TABLE users ADD COLUMN email_verified_at TEXT;

ALTER TABLE subscriptions ADD COLUMN external_subscription_id TEXT;

CREATE TABLE IF NOT EXISTS auth_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_tokens_user_id ON auth_tokens(user_id);

CREATE TABLE IF NOT EXISTS sync_runs (
  id TEXT PRIMARY KEY,
  triggered_by TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  status TEXT NOT NULL,
  synced_count INTEGER NOT NULL DEFAULT 0,
  reminders_sent INTEGER NOT NULL DEFAULT 0,
  new_alerts_sent INTEGER NOT NULL DEFAULT 0,
  errors_json TEXT NOT NULL DEFAULT '[]'
);
