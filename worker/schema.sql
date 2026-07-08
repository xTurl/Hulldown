-- Per-device daily usage, keyed by an anonymous install id the app generates
-- locally (never tied to a WoT account). Enforces fair use so one install
-- can't exhaust the shared free quota.
CREATE TABLE IF NOT EXISTS usage_daily (
  device_id TEXT NOT NULL,
  day TEXT NOT NULL,      -- UTC calendar day, YYYY-MM-DD
  feature TEXT NOT NULL,  -- 'debrief' | 'weekly-coach' | 'tank-tips'
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (device_id, day, feature)
);

CREATE INDEX IF NOT EXISTS idx_usage_daily_day ON usage_daily(day);

-- Global (account-wide) daily usage per underlying Groq model, so we never
-- exceed Groq's own free-tier daily request budget across all Hulldown users.
CREATE TABLE IF NOT EXISTS usage_global (
  day TEXT NOT NULL,
  model TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, model)
);
