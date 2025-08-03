// Cloudflare Workers Telegram RSS Bot
// 完整版本，支持网页部署

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // 处理根路径 - 显示状态页面
    if (url.pathname === '/') {
      return new Response(getStatusPage(), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }
    
    // 处理Telegram webhook
    if (url.pathname === '/webhook' && request.method === 'POST') {
      return handleTelegramWebhook(request, env);
    }
    
    // 手动触发RSS检查
    if (url.pathname === '/check-rss' && request.method === 'GET') {
      ctx.waitUntil(checkAllRSSFeeds(env));
      return new Response('RSS检查已启动', { status: 200 });
    }
    
    // 设置webhook的便捷页面
    if (url.pathname === '/setup' && request.method === 'GET') {
      return new Response(getSetupPage(request.url), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }
    
    return new Response('Not Found', { status: 404 });
  },

  // 定时任务 - 每10分钟检查RSS
  async scheduled(event, env, ctx) {
    ctx.waitUntil(checkAllRSSFeeds(env));
  }
};

// 状态页面HTML
function getStatusPage() {
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Telegram RSS Bot Status</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        .status { background: #e8f5e8; padding: 15px; border-radius: 5px; margin: 10px 0; }
        .error { background: #ffe8e8; }
        .info { background: #e8f4fd; }
        code { background: #f4f4f4; padding: 2px 4px; border-radius: 3px; }
        .setup-link { display: inline-block; margin: 10px 0; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 5px; }
    </style>
</head>
<body>
    <h1>🤖 Telegram RSS Bot</h1>
    <div class="status">
        ✅ Bot is running successfully!
    </div>
    
    <h2>📋 功能说明</h2>
    <ul>
        <li>📰 订阅RSS源自动推送</li>
        <li>🔄 每10分钟自动检查更新</li>
        <li>👥 支持多用户同时使用</li>
        <li>💾 使用D1数据库存储订阅</li>
    </ul>
    
    <h2>🛠️ 设置步骤</h2>
    <ol>
        <li>确保已设置 TELEGRAM_BOT_TOKEN 环境变量</li>
        <li><a href="/setup" class="setup-link">点击这里设置Webhook</a></li>
        <li>在Telegram中找到你的机器人开始使用</li>
    </ol>
    
    <h2>📖 使用命令</h2>
    <ul>
        <li><code>/start</code> - 开始使用</li>
        <li><code>/subscribe &lt;RSS_URL&gt;</code> - 订阅RSS</li>
        <li><code>/unsubscribe &lt;RSS_URL&gt;</code> - 取消订阅</li>
        <li><code>/list</code> - 查看订阅列表</li>
    </ul>
    
    <div class="info">
        💡 提示: 访问 <code>/check-rss</code> 可手动触发RSS检查
    </div>
</body>
</html>`;
}

// 设置页面HTML
function getSetupPage(currentUrl) {
  const baseUrl = currentUrl.replace('/setup', '');
  const webhookUrl = `${baseUrl}/webhook`;
  
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Setup Telegram Webhook</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        .webhook-url { background: #f8f9fa; padding: 15px; border-radius: 5px; font-family: monospace; word-break: break-all; margin: 10px 0; }
        .copy-btn { padding: 8px 16px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; margin: 5px; }
        .step { background: #f8f9fa; padding: 15px; margin: 10px 0; border-radius: 5px; }
        .warning { background: #fff3cd; padding: 10px; border-radius: 5px; margin: 10px 0; }
    </style>
</head>
<body>
    <h1>🔧 设置Telegram Webhook</h1>
    
    <div class="warning">
        ⚠️ 请确保已在Cloudflare Workers中设置了 <code>TELEGRAM_BOT_TOKEN</code> 环境变量
    </div>
    
    <div class="step">
        <h3>步骤1: 复制Webhook URL</h3>
        <div class="webhook-url" id="webhookUrl">${webhookUrl}</div>
        <button class="copy-btn" onclick="copyWebhookUrl()">复制URL</button>
    </div>
    
    <div class="step">
        <h3>步骤2: 设置Webhook</h3>
        <p>将以下URL在浏览器中打开（替换 YOUR_BOT_TOKEN）:</p>
        <div class="webhook-url" id="setWebhookUrl">https://api.telegram.org/botYOUR_BOT_TOKEN/setWebhook?url=${encodeURIComponent(webhookUrl)}</div>
        <button class="copy-btn" onclick="copySetWebhookUrl()">复制设置URL</button>
    </div>
    
    <div class="step">
        <h3>步骤3: 验证设置</h3>
        <p>设置成功后，访问以下URL验证webhook状态:</p>
        <div class="webhook-url">https://api.telegram.org/botYOUR_BOT_TOKEN/getWebhookInfo</div>
    </div>
    
    <script>
        function copyWebhookUrl() {
            const text = document.getElementById('webhookUrl').textContent;
            navigator.clipboard.writeText(text).then(() => {
                alert('Webhook URL已复制到剪贴板!');
            });
        }
        
        function copySetWebhookUrl() {
            const text = document.getElementById('setWebhookUrl').textContent;
            navigator.clipboard.writeText(text).then(() => {
                alert('设置URL已复制到剪贴板!');
            });
        }
    </script>
</body>
</html>`;
}

// 处理Telegram webhook
async function handleTelegramWebhook(request, env) {
  try {
    const update = await request.json();
    
    if (update.message) {
      await handleMessage(update.message, env);
    }
    
    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error('Webhook处理错误:', error);
    return new Response('Error', { status: 500 });
  }
}

// 处理消息
async function handleMessage(message, env) {
  const chatId = message.chat.id;
  const text = message.text || '';
  const userId = message.from.id;
  
  try {
    if (text.startsWith('/start')) {
      const welcomeText = `🤖 欢迎使用RSS订阅机器人！

📋 可用命令：
/subscribe <RSS_URL> - 订阅RSS源
/unsubscribe <RSS_URL> - 取消订阅RSS源  
/list - 查看我的订阅列表
/help - 查看帮助信息

💡 示例：
/subscribe https://example.com/rss.xml

开始添加你感兴趣的RSS源吧！`;
      
      await sendMessage(chatId, welcomeText, env);
    }
    else if (text.startsWith('/subscribe ')) {
      const rssUrl = text.replace('/subscribe ', '').trim();
      await subscribeRSS(chatId, userId, rssUrl, env);
    }
    else if (text.startsWith('/unsubscribe ')) {
      const rssUrl = text.replace('/unsubscribe ', '').trim();
      await unsubscribeRSS(chatId, rssUrl, env);
    }
    else if (text === '/list') {
      await listSubscriptions(chatId, env);
    }
    else if (text === '/help') {
      await sendMessage(chatId, '请使用 /start 查看完整帮助信息。', env);
    }
    else {
      await sendMessage(chatId, '❓ 未知命令。请使用 /start 查看可用命令。', env);
    }
  } catch (error) {
    console.error('消息处理错误:', error);
    await sendMessage(chatId, '抱歉，处理您的请求时出现错误，请稍后重试。', env);
  }
}

// 订阅RSS
async function subscribeRSS(chatId, userId, rssUrl, env) {
  try {
    // 验证URL格式
    if (!rssUrl || !rssUrl.startsWith('http')) {
      await sendMessage(chatId, '❌ 请提供有效的RSS URL（需要以http或https开头）', env);
      return;
    }
    
    // 验证RSS源
    const response = await fetch(rssUrl, {
      headers: { 'User-Agent': 'TelegramRSSBot/1.0' },
      timeout: 10000
    });
    
    if (!response.ok) {
      await sendMessage(chatId, `❌ 无法访问RSS源: ${rssUrl}\n状态码: ${response.status}`, env);
      return;
    }
    
    const rssContent = await response.text();
    if (!rssContent.includes('<rss') && !rssContent.includes('<feed') && !rssContent.includes('<channel>')) {
      await sendMessage(chatId, '❌ 该URL不是有效的RSS或Atom格式', env);
      return;
    }
    
    // 保存订阅
    const result = await env.DB.prepare(`
      INSERT INTO subscriptions (chat_id, user_id, rss_url, created_at) 
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(chat_id, rss_url) DO NOTHING
    `).bind(chatId, userId, rssUrl).run();
    
    if (result.changes > 0) {
      // 初始化RSS缓存
      await env.RSS_CACHE.put(`last_check_${btoa(rssUrl)}`, Date.now().toString());
      await sendMessage(chatId, `✅ 成功订阅RSS:\n${rssUrl}`, env);
    } else {
      await sendMessage(chatId, '❌ 您已经订阅过这个RSS源了', env);
    }
    
  } catch (error) {
    console.error('订阅RSS错误:', error);
    await sendMessage(chatId, '❌ 订阅失败，请检查RSS URL是否正确', env);
  }
}

// 取消订阅
async function unsubscribeRSS(chatId, rssUrl, env) {
  try {
    const result = await env.DB.prepare(`
      DELETE FROM subscriptions WHERE chat_id = ? AND rss_url = ?
    `).bind(chatId, rssUrl).run();
    
    if (result.changes > 0) {
      await sendMessage(chatId, `✅ 已取消订阅:\n${rssUrl}`, env);
    } else {
      await sendMessage(chatId, '❌ 未找到该订阅', env);
    }
  } catch (error) {
    console.error('取消订阅错误:', error);
    await sendMessage(chatId, '❌ 取消订阅失败，请稍后重试', env);
  }
}

// 列出订阅
async function listSubscriptions(chatId, env) {
  try {
    const result = await env.DB.prepare(`
      SELECT rss_url, created_at FROM subscriptions 
      WHERE chat_id = ? 
      ORDER BY created_at DESC
    `).bind(chatId).all();
    
    if (result.results.length === 0) {
      await sendMessage(chatId, '📋 您还没有订阅任何RSS源\n\n使用 /subscribe <URL> 来添加订阅', env);
      return;
    }
    
    let message = `📋 您的RSS订阅列表 (${result.results.length}个):\n\n`;
    result.results.forEach((sub, index) => {
      const date = new Date(sub.created_at + 'Z').toLocaleDateString('zh-CN');
      message += `${index + 1}. ${sub.rss_url}\n📅 订阅时间: ${date}\n\n`;
    });
    
    message += '💡 使用 /unsubscribe <URL> 来取消订阅';
    await sendMessage(chatId, message, env);
    
  } catch (error) {
    console.error('获取订阅列表错误:', error);
    await sendMessage(chatId, '❌ 获取订阅列表失败', env);
  }
}

// 检查所有RSS源
async function checkAllRSSFeeds(env) {
  try {
    const result = await env.DB.prepare(`
      SELECT DISTINCT rss_url FROM subscriptions
    `).all();
    
    console.log(`开始检查 ${result.results.length} 个RSS源`);
    
    for (const row of result.results) {
      try {
        await checkRSSFeed(row.rss_url, env);
        // 避免请求过快
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`检查RSS ${row.rss_url} 失败:`, error);
      }
    }
    
    console.log('RSS检查完成');
  } catch (error) {
    console.error('检查RSS源错误:', error);
  }
}

// 检查单个RSS源
async function checkRSSFeed(rssUrl, env) {
  const lastCheckKey = `last_check_${btoa(rssUrl)}`;
  const lastItemsKey = `last_items_${btoa(rssUrl)}`;
  
  try {
    // 检查频率控制
    const lastCheck = await env.RSS_CACHE.get(lastCheckKey);
    const now = Date.now();
    
    if (lastCheck && (now - parseInt(lastCheck)) < 300000) { // 5分钟内不重复检查
      return;
    }
    
    // 获取RSS内容
    const response = await fetch(rssUrl, {
      headers: { 'User-Agent': 'TelegramRSSBot/1.0' },
      timeout: 15000
    });
    
    if (!response.ok) {
      console.error(`RSS源访问失败: ${rssUrl}, 状态: ${response.status}`);
      return;
    }
    
    const rssContent = await response.text();
    const items = parseRSS(rssContent);
    
    if (items.length === 0) {
      console.log(`RSS源无内容: ${rssUrl}`);
      return;
    }
    
    // 获取上次的文章列表
    const lastItemsJson = await env.RSS_CACHE.get(lastItemsKey);
    const lastItems = lastItemsJson ? JSON.parse(lastItemsJson) : [];
    
    // 找出新文章
    const newItems = items.filter(item => 
      item.link && !lastItems.some(lastItem => lastItem.link === item.link)
    );
    
    if (newItems.length > 0) {
      console.log(`RSS源 ${rssUrl} 发现 ${newItems.length} 篇新文章`);
      await notifySubscribers(rssUrl, newItems, env);
      
      // 更新缓存 - 保留最新20篇文章
      const updatedItems = [...newItems, ...lastItems].slice(0, 20);
      await env.RSS_CACHE.put(lastItemsKey, JSON.stringify(updatedItems));
    }
    
    // 更新检查时间
    await env.RSS_CACHE.put(lastCheckKey, now.toString());
    
  } catch (error) {
    console.error(`检查RSS源错误 ${rssUrl}:`, error);
  }
}

// RSS解析器
function parseRSS(rssContent) {
  const items = [];
  
  try {
    // 匹配RSS items或Atom entries
    const itemRegex = /<(?:item|entry)[^>]*>[\s\S]*?<\/(?:item|entry)>/gi;
    const matches = rssContent.match(itemRegex);
    
    if (matches) {
      matches.forEach(match => {
        const title = extractTag(match, 'title');
        const link = extractTag(match, 'link') || extractAttribute(match, 'link', 'href');
        const description = extractTag(match, 'description') || extractTag(match, 'summary') || extractTag(match, 'content');
        const pubDate = extractTag(match, 'pubDate') || extractTag(match, 'published') || extractTag(match, 'updated');
        
        if (title && link) {
          items.push({
            title: cleanText(title),
            link: link.trim(),
            description: cleanText(description || ''),
            pubDate: pubDate ? cleanText(pubDate) : ''
          });
        }
      });
    }
  } catch (error) {
    console.error('RSS解析错误:', error);
  }
  
  return items.slice(0, 3); // 最多返回3篇最新文章
}

// 提取XML标签
function extractTag(xml, tagName) {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = xml.match(regex);
  return match ? match[1] : null;
}

// 提取XML属性
function extractAttribute(xml, tagName, attrName) {
  const regex = new RegExp(`<${tagName}[^>]*\\s${attrName}=["']([^"']*?)["']`, 'i');
  const match = xml.match(regex);
  return match ? match[1] : null;
}

// 清理文本
function cleanText(text) {
  if (!text) return '';
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// 通知订阅者
async function notifySubscribers(rssUrl, newItems, env) {
  try {
    const result = await env.DB.prepare(`
      SELECT DISTINCT chat_id FROM subscriptions WHERE rss_url = ?
    `).bind(rssUrl).all();
    
    for (const row of result.results) {
      for (const item of newItems) {
        const message = formatArticleMessage(item);
        await sendMessage(row.chat_id, message, env);
        
        // 控制发送频率
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
  } catch (error) {
    console.error('通知订阅者错误:', error);
  }
}

// 格式化文章消息
function formatArticleMessage(item) {
  let message = `📰 新文章推送\n\n`;
  message += `📝 ${item.title}\n\n`;
  
  if (item.description && item.description.length > 0) {
    const desc = item.description.length > 150 
      ? item.description.substring(0, 150) + '...' 
      : item.description;
    message += `📄 ${desc}\n\n`;
  }
  
  message += `🔗 ${item.link}`;
  
  if (item.pubDate) {
    message += `\n⏰ ${item.pubDate}`;
  }
  
  return message;
}

// 发送Telegram消息
async function sendMessage(chatId, text, env) {
  try {
    const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('发送消息失败:', errorText);
    }
  } catch (error) {
    console.error('发送消息错误:', error);
  }
}
