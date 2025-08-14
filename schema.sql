-- 订阅表
CREATE TABLE subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    rss_url TEXT NOT NULL,
    site_name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, rss_url)
);

-- RSS文章表 (用于防止重复推送)
CREATE TABLE rss_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rss_url TEXT NOT NULL,
    item_guid TEXT NOT NULL,
    title TEXT NOT NULL,
    link TEXT,
    published_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(rss_url, item_guid)
);

-- RSS失败记录表 (用于跟踪访问失败的RSS源)
CREATE TABLE rss_failures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rss_url TEXT NOT NULL UNIQUE,
    error_message TEXT,
    failure_count INTEGER DEFAULT 1,
    last_failure DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 推送目标：记录被添加的群组/超级群组/频道
CREATE TABLE IF NOT EXISTS push_targets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_user_id TEXT NOT NULL,
    chat_id TEXT NOT NULL,
    chat_type TEXT NOT NULL, -- group | supergroup | channel
    title TEXT,
    username TEXT,
    status TEXT DEFAULT 'active', -- active | inactive
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(owner_user_id, chat_id)
);

-- 订阅与推送目标的绑定关系（一个订阅可以绑定多个目标）
CREATE TABLE IF NOT EXISTS subscription_targets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_user_id TEXT NOT NULL,
    rss_url TEXT NOT NULL,
    chat_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(owner_user_id, rss_url, chat_id)
);

-- 推送记录：用于防止同一条文章对同一目标重复推送
CREATE TABLE IF NOT EXISTS push_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rss_url TEXT NOT NULL,
    item_guid TEXT NOT NULL,
    chat_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(rss_url, item_guid, chat_id)
);

-- 用户推送模式表：存储用户的推送偏好设置
CREATE TABLE IF NOT EXISTS user_push_modes (
    user_id TEXT PRIMARY KEY,
    push_mode TEXT DEFAULT 'smart' CHECK (push_mode IN ('smart', 'both', 'private', 'targets')),
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
