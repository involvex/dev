CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY,
    password TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
);
