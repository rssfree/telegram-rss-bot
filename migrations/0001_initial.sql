-- 创建订阅表
CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    rss_url TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(chat_id, rss_url)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_subscriptions_chat_id ON subscriptions(chat_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_rss_url ON subscriptions(rss_url);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);

-- 可选：RSS源信息表
CREATE TABLE IF NOT EXISTS rss_feeds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT UNIQUE NOT NULL,
    title TEXT,
    description TEXT,
    last_checked DATETIME,
    status TEXT DEFAULT 'active'
);
