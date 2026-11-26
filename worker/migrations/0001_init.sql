-- captures: the phone's "Save" lands here before any AI work. client_id makes retries idempotent.
CREATE TABLE IF NOT EXISTS captures (
  id TEXT PRIMARY KEY,
  client_id TEXT UNIQUE,
  url TEXT,
  text TEXT,
  title TEXT,
  why TEXT NOT NULL DEFAULT '',
  intent TEXT,                      -- writing | feed | list | review | NULL (agent decides)
  list_hint TEXT,                   -- list slug the owner picked, if any
  visibility TEXT NOT NULL DEFAULT 'public',
  status TEXT NOT NULL DEFAULT 'captured', -- captured|queued|processing|needs_owner|done|failed|cancelled
  claimed_by TEXT,
  claimed_until TEXT,
  result_json TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS captures_status ON captures(status, created_at);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,               -- organize | enrich | derive_media | refresh_dates | reindex | webhook
  subject_id TEXT,
  idempotency_key TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending', -- pending|leased|succeeded|failed|dead
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  next_run_at TEXT NOT NULL,
  lease_until TEXT,
  last_error TEXT,
  payload_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS jobs_due ON jobs(status, next_run_at);

CREATE TABLE IF NOT EXISTS job_steps (
  job_id TEXT NOT NULL,
  step TEXT NOT NULL,
  status TEXT NOT NULL,             -- done | failed
  output_json TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (job_id, step)
);

-- records: an index of the vault, rebuilt from GitHub push webhooks (never the source of truth)
CREATE TABLE IF NOT EXISTS records (
  id TEXT PRIMARY KEY,
  path TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL,
  kind TEXT,
  title TEXT,
  visibility TEXT,
  blob_sha TEXT,
  conflict INTEGER NOT NULL DEFAULT 0,
  frontmatter_json TEXT,
  body_excerpt TEXT,
  indexed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS records_type ON records(type, kind);

CREATE TABLE IF NOT EXISTS record_identities (
  provider TEXT NOT NULL,
  external_id TEXT NOT NULL,
  record_id TEXT NOT NULL,
  PRIMARY KEY (provider, external_id)
);

CREATE TABLE IF NOT EXISTS suggestions (
  id TEXT PRIMARY KEY,
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'related',
  reason TEXT,
  confidence REAL,
  status TEXT NOT NULL DEFAULT 'open', -- open | accepted | dismissed
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS dismissals (
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  dismissed_at TEXT NOT NULL,
  PRIMARY KEY (from_id, to_id, kind)
);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  capture_id TEXT,
  record_id TEXT,
  question TEXT NOT NULL,
  options_json TEXT,
  answer TEXT,
  status TEXT NOT NULL DEFAULT 'open', -- open | answered | expired
  asked_by TEXT,
  created_at TEXT NOT NULL,
  answered_at TEXT
);

CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,               -- photo | artwork | og
  orig_key TEXT,
  provider_ref TEXT,
  record_id TEXT,
  approved INTEGER NOT NULL DEFAULT 0,
  content_hash TEXT,
  width INTEGER,
  height INTEGER,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS media_variants (
  media_id TEXT NOT NULL,
  variant TEXT NOT NULL,            -- thumb | poster | cover | clip | logo | full
  r2_key TEXT,
  hash8 TEXT,
  width INTEGER,
  height INTEGER,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | ready | failed
  provider TEXT,
  params_json TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (media_id, variant)
);

CREATE TABLE IF NOT EXISTS agent_tokens (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  token_hash TEXT UNIQUE NOT NULL,
  scopes TEXT NOT NULL,
  last_used_at TEXT,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS webhooks (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  secret TEXT NOT NULL,
  events TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id TEXT PRIMARY KEY,
  webhook_id TEXT NOT NULL,
  event TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_run_at TEXT NOT NULL,
  last_error TEXT
);

CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  principal TEXT NOT NULL,
  tool TEXT NOT NULL,
  input_json TEXT,
  output_json TEXT,
  ok INTEGER NOT NULL
);
