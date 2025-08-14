# Telegram RSS Bot

一个部署在 Cloudflare Workers 上的 Telegram RSS 订阅机器人。

## .部署步骤（网页端操作）

## RSS Telegram Bot (Cloudflare Workers)

一个部署在 Cloudflare Workers 上的 RSS → Telegram 推送机器人，使用 Cloudflare D1 作为存储。支持在线（网页端）全流程部署，无需本地命令行；支持多订阅与多推送目标的灵活绑定，具备去重推送、批量操作与定时检查。

### 功能特性
- 支持添加/删除单个或多个 RSS 订阅
- 重复订阅检测和友好提示
- RSS 内容解析与 HTML 清理
- 推送格式化（标题 + 链接 + 预览 + 来源 + 时间）
- 去重推送机制（同一文章对同一目标只推一次）
- 定时检查 RSS 更新（建议每 10 分钟）
- 完全网页端部署，无需命令行
- 支持批量绑定订阅到多个目标（/bind）

---

## 文件结构

```text
rss-telegram-bot-main/
├─ README.md
├─ wrangler.toml
├─ schema.sql
├─ package.json
└─ src/
   ├─ index.js           # Cloudflare Worker 入口，定义路由与调度（/webhook, /check-rss 等）
   ├─ db-manager.js      # D1 数据库访问层，增删改查、去重记录、订阅/目标管理
   ├─ rss-parser.js      # RSS 获取与解析、HTML 清洗和内容裁剪
   └─ telegram-bot.js    # Telegram 命令解析、业务逻辑与消息格式化
```

- `schema.sql`: D1 数据库初始化脚本（在 D1 控制台执行以创建表结构）
- `wrangler.toml`: 可选的 Wrangler 配置（如采用本地命令行开发/部署时使用）

---

## 架构与工作流程

- Cloudflare Worker 暴露 HTTP 路由：
  - `POST /webhook`: Telegram Webhook 回调入口，处理用户命令与消息
  - `GET /check-rss`: 手动触发 RSS 拉取与推送（便于调试或按需执行）
  - （可选）`GET /health`: 健康检查（若实现）
- 定时触发（Cron Trigger）：建议 `*/10 * * * *` 每 10 分钟检查 RSS 更新
- 数据存储：Cloudflare D1（用于保存订阅、推送目标、绑定关系、已推送去重记录等）
- 主要模块协作：
  - `telegram-bot.js`: 解析 Telegram 命令 → 调用 `db-manager.js` 与 `rss-parser.js`
  - `rss-parser.js`: 拉取 RSS、解析并清洗内容
  - `db-manager.js`: 维护订阅、目标、绑定关系和去重记录
  - `index.js`: 路由与触发器入口，调用上面模块完成任务

---

## 快速开始（全网页部署，无需命令行）

### 1. 准备 Cloudflare 账号
- 登录 Cloudflare Dashboard（Workers & Pages）

### 2. 创建 D1 数据库
- Dashboard → D1 SQL Database → Create database
- 命名：`rss-bot-db`
- 打开数据库详情 → Console，将仓库中的 `schema.sql` 全量复制粘贴执行，创建表结构

### 3. 创建 Telegram Bot
- 与 `@BotFather` 对话 → `/newbot` 按提示创建
- 记录 Bot Token（格式：`123456789:ABCdef...`）

### 4. 创建 Worker（网页端）
- Workers & Pages → Create application → Create Worker
- 命名：`rss-telegram-bot` → Deploy
- 打开 Worker → Edit code（在线编辑器）
- 删除默认代码，分别新建并粘贴仓库内 `src/index.js`、`src/rss-parser.js`、`src/telegram-bot.js`、`src/db-manager.js` 四个文件内容
- Save and deploy

### 5. 绑定环境变量与 D1
- Worker → Settings → Environment Variables → Add variable
  - `TELEGRAM_BOT_TOKEN` = 你的 Telegram Bot Token
- Worker → Settings → Bindings → Add binding → D1 database
  - Variable name: `DB`
  - D1 database: 选择 `rss-bot-db`
- Save and deploy

### 6. 设置 Webhook
- 获取 Worker URL，例如：`https://rss-telegram-bot.<你的账户名>.workers.dev`
- 浏览器访问（替换 TOKEN 与域名）：
```text
https://api.telegram.org/bot<你的BOT_TOKEN>/setWebhook?url=https://rss-telegram-bot.<你的账户名>.workers.dev/webhook
```
- 返回 `{"ok":true,"result":true...}` 即成功

### 7. 设置定时任务（Cron）
- Worker → Triggers → Add Cron Trigger
- 表达式：`*/10 * * * *`（每 10 分钟）
- Add trigger

---

## 配置项

- 环境变量
  - `TELEGRAM_BOT_TOKEN`: Telegram 机器人 Token
- 绑定
  - `DB`: 绑定到 Cloudflare D1 实例 `rss-bot-db`
- 手动触发
  - 在浏览器访问 `GET /check-rss` 可立即触发 RSS 检查与推送

---

## Telegram 命令与用法

说明：以下命令在私聊或群聊中均可用。若用于群组，请先将 Bot 拉入群并授予相应权限。

- `/start`
  - 功能：初始化对话/欢迎信息与基本帮助提示

- `/help`
  - 功能：显示可用命令与用法说明

- `/add <rss_url>[, <rss_url> ...]`
  - 功能：添加一个或多个 RSS 订阅，自动去重
  - 示例：
    - `/add https://feeds.feedburner.com/ruanyifeng`
    - `/add https://a.com/rss, https://b.com/feed`

- `/list`
  - 功能：列出当前所有订阅（带编号）
  - 说明：后续命令中的“订阅号”来源于此列表

- `/del <订阅号 | 订阅号,订阅号 | 订阅号-订阅号>`
  - 功能：删除一个或多个订阅
  - 示例：
    - `/del 1`
    - `/del 1,3`
    - `/del 1-3`

- `/channels`
  - 功能：列出所有推送目标（带编号）
  - 说明：后续命令中的“目标号”来源于此列表（通常与 `/targets list` 等价）

- `/targets list`
  - 功能：列出所有推送目标（带编号、状态）

- `/targets add <chat_id> [name]`
  - 功能：添加一个推送目标（个人/群/频道）
  - 示例：
    - 私聊 ID：直接填写数字
    - 群/频道 ID：通常以 `-100` 开头，如 `-1001234567890`
    - `/targets add -1001234567890 前端技术群`

- `/targets delete <目标号>`
  - 功能：删除目标；删除后会进行存在性校验，避免误报

- `/targets activate <目标号>`
- `/targets deactivate <目标号>`
  - 功能：激活/停用目标；仅激活状态的目标会接收推送

- `/bind <订阅号|范围|多选> <目标号|范围|多选>`
  - 功能：将订阅批量绑定到一个或多个目标
  - 支持格式：
    - 单个：`2`
    - 逗号：`1,3`
    - 范围：`1-3`
  - 示例：
    - 将订阅 1~3 绑定到目标 2：`/bind 1-3 2`
    - 将订阅 1、3 绑定到目标 2、4：`/bind 1,3 2,4`

> 注：
> - 订阅号来自 `/list`
> - 目标号来自 `/channels` 或 `/targets list`
> - 同一文章对同一目标会去重推送
> - 如需“按目标解绑”的命令（例如 `/unbindto <订阅号> <目标号,目标号>`），可按需增加

---

## 推送与去重策略

- 推送内容包含：标题、链接、内容预览、来源（Feed 标题）、发布时间
- 针对“订阅 × 目标”的组合进行去重，避免重复推送同一篇文章
- 定时任务与手动触发共享同一套去重策略

---

## 常见问题（FAQ）

- Webhook 设置成功但 Bot 不响应？
  - 确认 `TELEGRAM_BOT_TOKEN` 正确、Worker 已部署成功
  - 确认 Webhook URL 指向 `.../webhook` 路径
  - 在 Worker Logs 查看错误信息

- 群/频道 Chat ID 如何获取？
  - 将 Bot 拉进群并发送消息，再查看更新中的 `chat.id`
  - 也可使用第三方工具或调试脚本获取；频道/超级群通常以 `-100` 开头

- 定时任务未触发？
  - 检查 Worker → Triggers 是否已配置 Cron 表达式
  - 确认 Worker 未因配额/路由等限制被拦截

- 如何立即检查一次 RSS？
  - 浏览器访问 Worker 的 `GET /check-rss` 端点即可立即执行

---

## 维护建议

- 定期查看 Worker 的日志（Errors/Exceptions）
- 控制订阅数量与抓取频率，避免超出平台配额
- 通过 `/targets activate/deactivate` 管理活跃目标
- D1 数据库容量随时间增长，注意清理过旧数据（可定期归档/删除）

---

