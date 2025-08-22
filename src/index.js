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
      
      if (subscriptions.length === 0) {
        console.log('没有找到任何RSS订阅');
        return;
      }
      
      // 将订阅按 rss_url 分组，避免重复抓取
      const urlToSubscribers = new Map();
      for (const sub of subscriptions) {
        const key = sub.rss_url;
        if (!urlToSubscribers.has(key)) {
          urlToSubscribers.set(key, []);
        }
        urlToSubscribers.get(key).push(sub);
      }

      // 分批处理 URLs，避免超时
      const urls = Array.from(urlToSubscribers.keys());
      const BATCH_SIZE = 15; // 进一步减少批次大小，避免Cloudflare Workers超时
      
      console.log(`开始处理 ${urls.length} 个RSS源，批次大小: ${BATCH_SIZE}`);
      
      for (let i = 0; i < urls.length; i += BATCH_SIZE) {
        const batchUrls = urls.slice(i, i + BATCH_SIZE);
        console.log(`处理批次 ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(urls.length/BATCH_SIZE)}`);
        
        // 使用Promise.allSettled避免单个失败影响整批
        const results = await Promise.allSettled(batchUrls.map(async (rssUrl) => {
          const subsForUrl = urlToSubscribers.get(rssUrl);
          const siteName = subsForUrl[0]?.site_name || 'RSS';
          
          try {
            // 检查访问统计
            const stats = rssParser.getAccessStats(rssUrl);
            if (stats.rateLimitCount > 0) {
              console.log(`跳过 ${siteName} (${rssUrl}) - 频率限制中 (${stats.rateLimitCount}次)`);
              return { skipped: true, reason: 'rate_limited' };
            }
            
            const items = await rssParser.parseRSS(rssUrl);
            if (items.length > 0) {
              await dbManager.clearFailureRecord(rssUrl);
              console.log(`成功解析 ${siteName}: ${items.length} 条内容`);
              
              let processedCount = 0;
              for (const item of items) {
                try {
                  const exists = await dbManager.checkItemExists(rssUrl, item.guid);
                  if (exists) continue;

                  // 推送给所有订阅该URL的用户
                  for (const sub of subsForUrl) {
                    try {
                      await bot.sendRSSUpdate(sub.user_id, rssUrl, item, siteName);
                      // 增加延迟，避免Telegram API速率限制
                      await new Promise(resolve => setTimeout(resolve, 150));
                    } catch (error) {
                      console.error(`推送给用户 ${sub.user_id} 失败:`, error.message);
                      // 不中断整个批处理过程
                    }
                  }
                  
                  await dbManager.saveRSSItem(rssUrl, item);
                  processedCount++;
                  
                  // 每条item之间增加延迟
                  await new Promise(resolve => setTimeout(resolve, 300));
                } catch (error) {
                  console.error(`处理RSS项目失败:`, error.message);
                }
              }
              
              return { success: true, processed: processedCount };
            } else {
              console.log(`跳过 ${siteName} - 无新内容或访问被限制`);
              return { skipped: true, reason: 'no_content' };
            }
          } catch (error) {
            console.error(`处理RSS源 ${rssUrl} 失败:`, error);
            await dbManager.recordFailure(rssUrl, error.message);
            return { error: true, message: error.message };
          }
        }));
        
        // 统计批次结果
        const batchStats = {
          total: batchUrls.length,
          success: 0,
          skipped: 0,
          error: 0
        };
        
        results.forEach(result => {
          if (result.status === 'fulfilled') {
            if (result.value.success) batchStats.success++;
            else if (result.value.skipped) batchStats.skipped++;
            else if (result.value.error) batchStats.error++;
          } else {
            batchStats.error++;
            console.error('批次处理失败:', result.reason);
          }
        });
        
        console.log(`批次 ${Math.floor(i/BATCH_SIZE) + 1} 完成: 成功${batchStats.success}, 跳过${batchStats.skipped}, 失败${batchStats.error}`);
        
        // 批次间延迟，避免过载
        if (i + BATCH_SIZE < urls.length) {
          const delay = 3000; // 增加到3秒延迟
          console.log(`等待 ${delay}ms 后处理下一批次...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
      
      // 清理30天前的旧记录
      try {
        await dbManager.cleanupOldItems(30);
      } catch (error) {
        console.error('清理旧记录失败:', error);
      }
      
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
      // 记录到数据库以便后续分析
      try {
        await dbManager.recordFailure('SYSTEM_ERROR', `RSS检查失败: ${error.message}`);
      } catch (dbError) {
        console.error('记录系统错误失败:', dbError);
      }
    }
  }
};
