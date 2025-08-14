import { TelegramBot } from './telegram-bot.js';
import { RSSParser } from './rss-parser.js';
import { DBManager } from './db-manager.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Ensure new schema tables exist
    try {
      const dbManager = new DBManager(env.DB);
      await dbManager.ensureSchema();
    } catch (e) {
      console.warn('初始化数据库结构失败(可忽略):', e.message);
    }

    // Telegram Webhook处理
    if (url.pathname === '/webhook' && request.method === 'POST') {
      const bot = new TelegramBot(env.TELEGRAM_BOT_TOKEN, env.DB);
      const update = await request.json();
      return await bot.handleUpdate(update);
    }
    
    // 手动触发RSS检查
    if (url.pathname === '/check-rss' && request.method === 'GET') {
      await this.checkRSSFeeds(env);
      return new Response('RSS检查完成', { status: 200 });
    }
    
    return new Response('RSS Telegram Bot运行中', { status: 200 });
  },

  // Cron触发的RSS检查
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(this.checkRSSFeeds(env));
  },

  // 检查所有RSS源（优化版本）
  async checkRSSFeeds(env) {
    const dbManager = new DBManager(env.DB);
    const rssParser = new RSSParser();
    const bot = new TelegramBot(env.TELEGRAM_BOT_TOKEN, env.DB);
    
    try {
      // 获取所有订阅
      const subscriptions = await dbManager.getAllSubscriptions();
      
      // 将订阅按 rss_url 分组，避免重复抓取
      const urlToSubscribers = new Map();
      for (const sub of subscriptions) {
        const key = sub.rss_url;
        if (!urlToSubscribers.has(key)) urlToSubscribers.set(key, []);
        urlToSubscribers.get(key).push(sub);
      }

      // 分批处理 URLs，避免超时
      const urls = Array.from(urlToSubscribers.keys());
      const BATCH_SIZE = 20; // 减少批次大小，避免过载
      
      console.log(`开始处理 ${urls.length} 个RSS源，批次大小: ${BATCH_SIZE}`);
      
      for (let i = 0; i < urls.length; i += BATCH_SIZE) {
        const batchUrls = urls.slice(i, i + BATCH_SIZE);
        console.log(`处理批次 ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(urls.length/BATCH_SIZE)}`);
        
        await Promise.all(batchUrls.map(async (rssUrl) => {
          const subsForUrl = urlToSubscribers.get(rssUrl);
          const siteName = subsForUrl[0]?.site_name || 'RSS';
          
          try {
            // 检查访问统计
            const stats = rssParser.getAccessStats(rssUrl);
            if (stats.rateLimitCount > 0) {
              console.log(`跳过 ${siteName} (${rssUrl}) - 频率限制中 (${stats.rateLimitCount}次)`);
              return;
            }
            
            const items = await rssParser.parseRSS(rssUrl);
            if (items.length > 0) {
              await dbManager.clearFailureRecord(rssUrl);
              console.log(`成功解析 ${siteName}: ${items.length} 条内容`);
              
              for (const item of items) {
                const exists = await dbManager.checkItemExists(rssUrl, item.guid);
                if (exists) continue;

                // 推送给所有订阅该URL的用户（每人私聊 + 各自绑定的目标）
                for (const sub of subsForUrl) {
                  await bot.sendRSSUpdate(sub.user_id, rssUrl, item, siteName);
                  // 100ms between users to be gentle
                  await new Promise(resolve => setTimeout(resolve, 100));
                }
                await dbManager.saveRSSItem(rssUrl, item);
                // 每条item之间 200ms
                await new Promise(resolve => setTimeout(resolve, 200));
              }
            } else {
              console.log(`跳过 ${siteName} - 无新内容或访问被限制`);
            }
          } catch (error) {
            console.error(`处理RSS源 ${rssUrl} 失败:`, error);
            await dbManager.recordFailure(rssUrl, error.message);
          }
        }));
        
        // 批次间延迟，避免过载
        if (i + BATCH_SIZE < urls.length) {
          const delay = 2000; // 2秒延迟
          console.log(`等待 ${delay}ms 后处理下一批次...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
      
      // 清理30天前的旧记录
      await dbManager.cleanupOldItems(30);
      
      // 输出访问统计信息
      console.log('RSS检查完成，访问统计:');
      for (const url of urls) {
        const stats = rssParser.getAccessStats(url);
        if (stats.failureCount > 0 || stats.rateLimitCount > 0) {
          console.log(`${url}: 成功${stats.successCount}次, 失败${stats.failureCount}次, 限流${stats.rateLimitCount}次`);
        }
      }
      
    } catch (error) {
      console.error('RSS检查失败:', error);
    }
  }
};
