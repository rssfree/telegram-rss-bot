# Telegram RSS Bot

一个部署在 Cloudflare Workers 上的 Telegram RSS 订阅机器人。

## 功能特性

- 📰 RSS/Atom 源订阅管理
- 🔄 自动定时检查更新（每10分钟）
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

## 许可证

MIT License

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
对于这个Telegram RSS Bot项目，部署到 Cloudflare Workers：

1. 处理Telegram webhook - 动态API响应
2. 定时任务 - Cron triggers执行RSS检查
3. 数据库操作 - D1数据库读写
4. 外部API调用 - 获取RSS内容，发送Telegram消息
