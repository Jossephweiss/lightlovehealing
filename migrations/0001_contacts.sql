CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  interest TEXT,
  message TEXT,
  lang TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
