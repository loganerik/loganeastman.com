-- Pictures the Worker could not download (shops that block datacenter addresses) are handed to the Mac.
CREATE TABLE IF NOT EXISTS fetch_queue (
  id TEXT PRIMARY KEY,
  record_id TEXT NOT NULL,
  record_path TEXT NOT NULL,
  url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS fetch_queue_status ON fetch_queue (status, created_at);
