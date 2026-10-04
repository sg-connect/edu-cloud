CREATE TABLE work_cases (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, context TEXT NOT NULL,
  proposed_solution TEXT NOT NULL DEFAULT '', revision INTEGER NOT NULL DEFAULT 1,
  analyzed_revision INTEGER, status TEXT NOT NULL DEFAULT 'draft', error TEXT,
  result TEXT, model TEXT, lease_token TEXT, lease_until INTEGER,
  dispatched_at INTEGER, attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX work_cases_pending ON work_cases(status,dispatched_at);
