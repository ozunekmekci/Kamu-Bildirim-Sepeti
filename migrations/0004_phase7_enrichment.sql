ALTER TABLE announcements ADD COLUMN employment_type TEXT NOT NULL DEFAULT 'diger';
ALTER TABLE announcements ADD COLUMN notice_type TEXT NOT NULL DEFAULT 'ilan';
ALTER TABLE announcements ADD COLUMN exam_type TEXT NOT NULL DEFAULT 'unspecified';
ALTER TABLE announcements ADD COLUMN organization_unit TEXT;
ALTER TABLE announcements ADD COLUMN apply_url TEXT;
ALTER TABLE announcements ADD COLUMN verified_sources_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE announcements ADD COLUMN enrichment_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE announcements ADD COLUMN content_hash TEXT;
ALTER TABLE announcements ADD COLUMN last_seen_at TEXT;
ALTER TABLE announcements ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_announcements_taxonomy
  ON announcements(employment_type, status, deadline_at);

CREATE INDEX IF NOT EXISTS idx_announcements_demo_status
  ON announcements(is_demo, status);

CREATE TABLE IF NOT EXISTS announcement_positions (
  id TEXT PRIMARY KEY,
  announcement_id TEXT NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  unvan TEXT,
  city TEXT NOT NULL,
  district TEXT,
  quota INTEGER,
  education_level TEXT,
  kpss_score_type TEXT,
  min_kpss_score REAL,
  max_age INTEGER,
  military_required INTEGER NOT NULL DEFAULT 0,
  qualification_codes_json TEXT NOT NULL DEFAULT '[]',
  evaluation_method TEXT,
  is_interview_free INTEGER NOT NULL DEFAULT 0,
  requirements_summary TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_announcement_positions_announcement_id
  ON announcement_positions(announcement_id);

CREATE INDEX IF NOT EXISTS idx_announcement_positions_city
  ON announcement_positions(city);

CREATE INDEX IF NOT EXISTS idx_announcement_positions_kpss_score_type
  ON announcement_positions(kpss_score_type);

CREATE TABLE IF NOT EXISTS source_checkpoints (
  source TEXT PRIMARY KEY,
  etag TEXT,
  last_modified TEXT,
  body_hash TEXT,
  last_checked_at TEXT NOT NULL,
  last_changed_at TEXT,
  active_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);

CREATE TABLE IF NOT EXISTS saved_searches (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  filters_json TEXT NOT NULL,
  notify_push INTEGER NOT NULL DEFAULT 1,
  notify_email INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_saved_searches_user_id
  ON saved_searches(user_id);
