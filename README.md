# Telegram RSS Bot

一个部署在 Cloudflare Workers 上的 Telegram RSS 订阅机器人。

```
telegram-rss-bot/
├── src/
│   └── index.js          ✅
├── migrations/
│   └── 0001_initial.sql  ✅
├── package.json          ✅
├── wrangler.toml         ✅ (已编辑ID)
├── README.md             ✅
└── .gitignore            ✅
```

### 展示图

![CFRSS](https://meee.com.tw/ZiIYelX)
![CFRSS1](https://meee.com.tw/L6VxK1g)


## 功能特性

- 📰 RSS/Atom 源订阅管理
- 🔄 自动定时检查更新（每2分钟）
- 👥 多用户支持
- 💾 使用 D1 数据库持久化存储
- 🚀 完全无服务器架构

## 支持的命令

- `/start` - 查看帮助信息
- `/subscribe <RSS_URL>` - 订阅RSS源
- `/unsubscribe <RSS_URL>` - 取消订阅
- `/list` - 查看订阅列表

## 部署说明

本项目设计为通过网页界面完全部署，无需本地命令行操作。

### 技术架构

- **运行环境**: Cloudflare Workers
- **数据库**: Cloudflare D1 SQL Database  
- **缓存**: Cloudflare KV Storage
- **定时任务**: Cloudflare Cron Triggers

### 成本说明

基于 Cloudflare 免费计划:
- Workers: 100,000 requests/day
- D1: 5GB storage, 25M row reads/month
- KV: 10GB storage, 100K reads/day

正常使用完全在免费额度内。

## 使用示例

`/subscribe https://feeds.feedburner.com/oreilly/radar`

`/subscribe https://feeds.bbci.co.uk/news/rss.xml`

`/unsubscribe https://feeds.feedburner.com/oreilly/radar`

`/list`

## Cloudflare部署方法：

# 🚀 快速开始清单

## ✅ 部署前准备

### 1. Telegram Bot Token
- [ ] 与 @BotFather 对话
- [ ] 发送 `/newbot`
- [ ] 保存 Bot Token: `_________________________`

### 2. Cloudflare 账号
- [ ] 注册 cloudflare.com 账号
- [ ] 完成邮箱验证

## ✅ 创建 Cloudflare 资源

### D1 数据库
1. Cloudflare Dashboard > Workers & Pages > D1
2. Create database: `telegram-rss-db`  
3. Database ID: `_________________________`

### KV 命名空间  
1. Workers & Pages > KV > Create namespace
2. 名称: `telegram-rss-cache`
3. Namespace ID: `_________________________`

## ✅ Cloudflare 部署

### workers 部署
1. Workers & Pages > Create > workers
2. 到GitHub中telegram-rss-bot项目中
3. 复制`src/index.js`中代码到cloudflare workers中

### cloudflare D1、KV资源绑定
**D1 绑定:**
- Variable name: `DB`
- Database: `telegram-rss-db`

**KV 绑定:**  
- Variable name: `RSS_CACHE`
- Namespace: `telegram-rss-cache`

### 环境变量
- Variable name: `TELEGRAM_BOT_TOKEN`
- Value: (你的 Bot Token)

### 数据库初始化
1. D1 Console
2. 执行 `migrations/0001_initial.sql` 内容

## ✅ Webhook 设置

### Worker URL
`https://telegram-rss-bot.your-subdomain.workers.dev`

### 设置命令（浏览器访问）
```
https://api.telegram.org/bot[BOT_TOKEN]/setWebhook?url=https://[WORKER_URL]/webhook
```

### 验证命令（浏览器访问）
```
https://api.telegram.org/bot[BOT_TOKEN]/getWebhookInfo
```

## ✅ 测试功能

### Telegram bot中测试
- [ ] 发送 `/start` 
- [ ] 发送 `/subscribe https://feeds.feedburner.com/oreilly/radar`
- [ ] 发送 `/list`
- [ ] 等待 RSS 推送

### 状态检查
- [ ] 访问: `https://your-worker-url.workers.dev/`
- [ ] 访问: `https://your-worker-url.workers.dev/setup`
- [ ] 访问: `https://your-worker-url.workers.dev/check-rss`

## 🔧 关键配置复制区

### wrangler.toml 需要替换的内容:
```toml
# 替换这些 ID
[[kv_namespaces]]
binding = "RSS_CACHE"
id = "你的KV_NAMESPACE_ID"

[[d1_databases]]
binding = "DB" 
database_name = "telegram-rss-db"
database_id = "你的D1_DATABASE_ID"
```

### 测试 RSS 源列表:
```
https://feeds.bbci.co.uk/news/rss.xml (BBC News)
https://www.reddit.com/.rss (Reddit)
```

### 常用 Webhook 命令:
```bash
# 设置 Webhook
https://api.telegram.org/bot<TOKEN>/setWebhook?url=<WORKER_URL>/webhook

# 查看 Webhook 状态  
https://api.telegram.org/bot<TOKEN>/getWebhookInfo

# 删除 Webhook
https://api.telegram.org/bot<TOKEN>/deleteWebhook
```
