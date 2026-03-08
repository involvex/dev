CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    username TEXT,
    expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY,
    password TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE IF NOT EXISTS short_urls (
    id TEXT PRIMARY KEY,
    long_url TEXT NOT NULL,
    short_code TEXT UNIQUE NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    user_id TEXT
);
