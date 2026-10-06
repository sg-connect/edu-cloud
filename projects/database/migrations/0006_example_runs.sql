CREATE TABLE example_runs (
  id TEXT PRIMARY KEY, book_title TEXT NOT NULL, snapshot TEXT NOT NULL,
  example_count INTEGER NOT NULL CHECK(example_count IN (3,5)), model TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued', stage TEXT NOT NULL DEFAULT 'research',
  research TEXT, result TEXT, error TEXT, lease_token TEXT, lease_until INTEGER,
  dispatched_at INTEGER, attempts INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX example_runs_pending ON example_runs(status,dispatched_at);
