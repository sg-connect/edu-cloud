CREATE TABLE books (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, filename TEXT NOT NULL,
  page_count INTEGER NOT NULL, object_key TEXT NOT NULL,
  pages_key TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE chapters (
  id TEXT PRIMARY KEY, book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  title TEXT NOT NULL, start_page INTEGER NOT NULL, end_page INTEGER NOT NULL,
  position INTEGER NOT NULL, version INTEGER NOT NULL DEFAULT 1,
  CHECK (start_page > 0 AND end_page >= start_page)
);
CREATE INDEX chapters_book ON chapters(book_id, position);
CREATE TABLE jobs (
  id TEXT PRIMARY KEY, chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  chapter_version INTEGER NOT NULL, model TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('queued','running','ready','failed')),
  lease_token TEXT, lease_until INTEGER, dispatched_at INTEGER,
  error TEXT, attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(chapter_id, chapter_version)
);
CREATE INDEX jobs_pending ON jobs(status, dispatched_at, lease_until);
CREATE TABLE analyses (
  id TEXT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
  chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  chapter_version INTEGER NOT NULL, content TEXT NOT NULL,
  model TEXT NOT NULL, input_tokens INTEGER NOT NULL, output_tokens INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE notes (
  chapter_id TEXT PRIMARY KEY REFERENCES chapters(id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE tracks (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE track_items (
  id TEXT PRIMARY KEY, track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  title TEXT NOT NULL, explanation TEXT NOT NULL, page INTEGER NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(track_id, chapter_id, title)
);
INSERT INTO tracks (id,title,description) VALUES
('architecture','Software architecture','Boundaries, tradeoffs, and systems that can evolve.'),
('reliability','Reliable systems','Failure, consistency, and operating what we build.'),
('craft','Engineering craft','Maintainability, testing, and technical judgment.');
