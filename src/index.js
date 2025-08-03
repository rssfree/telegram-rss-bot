// Cloudflare Workers Telegram RSS Bot
// 增强版本，修复订阅问题并添加新功能
// 优化：2分钟检查频率 + 美化消息样式

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

  // 定时任务 - 每2分钟检查RSS
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
        <li>🔄 每2分钟自动检查更新</li>
        <li>👥 支持多用户同时使用</li>
        <li>💾 使用D1数据库存储订阅</li>
        <li>📦 支持批量订阅和取消订阅</li>
    </ul>
    
    <h2>🛠️ 设置步骤</h2>
    <ol>
        <li>确保已设置 TELEGRAM_BOT_TOKEN 环境变量</li>
        <li><a href="/setup" class="setup-link">点击这里设置Webhook</a></li>
        <li>在Telegram中找到你的机器人开始使用</li>
    </ol>
    
    <h2>📖 使用命令</h2>
    <ul>
        <li><code>/start</code> - 开始使用和查看帮助</li>
        <li><code>/subscribe &lt;RSS_URL&gt;</code> - 订阅RSS</li>
        <li><code>/multi_subscribe</code> - 批量订阅RSS</li>
        <li><code>/unsubscribe &lt;RSS_URL&gt;</code> - 取消订阅</li>
        <li><code>/multi_unsubscribe</code> - 批量取消订阅</li>
        <li><code>/list</code> - 查看订阅列表</li>
        <li><code>/clear_all</code> - 清空所有订阅</li>
        <li><code>/help</code> - 查看帮助信息</li>
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

━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 基础命令：

🔖 /subscribe <RSS_URL>
   订阅RSS源

🗑 /unsubscribe <RSS_URL>
   取消订阅RSS源

📰 /list
   查看我的订阅列表

━━━━━━━━━━━━━━━━━━━━━━━━━━

📦 批量操作：

📥 /multi_subscribe
   批量订阅多个RSS源

📤 /multi_unsubscribe
   批量取消订阅

━━━━━━━━━━━━━━━━━━━━━━━━━━

🛠 管理命令：

🗑 /clear_all
   清空所有订阅（需确认）

❓ /help
   查看详细帮助

━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 单个订阅示例：
/subscribe https://example.com/rss.xml

📝 批量订阅示例：
/multi_subscribe
https://example1.com/rss.xml
https://example2.com/feed.xml
https://example3.com/atom.xml

🚀 开始添加你感兴趣的RSS源吧！`;
      
      await sendMessage(chatId, welcomeText, env);
    }
    else if (text.startsWith('/subscribe ')) {
      const rssUrl = text.replace('/subscribe ', '').trim();
      await subscribeRSS(chatId, userId, rssUrl, env);
    }
    else if (text === '/multi_subscribe') {
      const helpText = `📦 批量订阅RSS源

━━━━━━━━━━━━━━━━━━━━━━━━━━

📝 使用方法：

请按以下格式发送多个RSS链接
（每行一个）：

/multi_subscribe
https://example1.com/rss.xml
https://example2.com/feed.xml
https://example3.com/atom.xml

━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 提示：
• 每行一个RSS链接
• 支持同时订阅多个源
• 无效链接会自动跳过
• 机器人会逐个验证链接有效性`;
      
      await sendMessage(chatId, helpText, env);
    }
    else if (text.startsWith('/multi_subscribe\n')) {
      const urls = text.split('\n').slice(1).filter(url => url.trim());
      await multiSubscribeRSS(chatId, userId, urls, env);
    }
    else if (text.startsWith('/unsubscribe ')) {
      const rssUrl = text.replace('/unsubscribe ', '').trim();
      await unsubscribeRSS(chatId, rssUrl, env);
    }
    else if (text === '/multi_unsubscribe') {
      await showUnsubscribeOptions(chatId, env);
    }
    else if (text.startsWith('/multi_unsubscribe\n')) {
      const urls = text.split('\n').slice(1).filter(url => url.trim());
      await multiUnsubscribeRSS(chatId, urls, env);
    }
    else if (text === '/list') {
      await listSubscriptions(chatId, env);
    }
    else if (text === '/clear_all') {
      await confirmClearAll(chatId, env);
    }
    else if (text === '/confirm_clear_all') {
      await clearAllSubscriptions(chatId, env);
    }
    else if (text === '/help') {
      const helpText = `🤖 RSS订阅机器人完整指南

━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 基础订阅命令：

🔖 /subscribe <URL>
   订阅单个RSS源

🗑 /unsubscribe <URL>
   取消订阅单个RSS源

📰 /list
   查看所有订阅

━━━━━━━━━━━━━━━━━━━━━━━━━━

📦 批量操作：

📥 /multi_subscribe
   批量订阅（输入命令后会显示使用方法）

📤 /multi_unsubscribe
   批量取消订阅（会显示当前订阅列表供选择）

━━━━━━━━━━━━━━━━━━━━━━━━━━

🛠 管理命令：

🗑 /clear_all
   清空所有订阅（需要确认）

❓ /help
   显示此帮助信息

🏠 /start
   显示欢迎信息

━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 使用技巧：

• RSS链接必须以http或https开头
• 机器人每2分钟自动检查更新
• 支持RSS和Atom格式
• 批量操作可以节省时间

━━━━━━━━━━━━━━━━━━━━━━━━━━

❓ 遇到问题？
请确保RSS链接有效且可访问。`;
      
      await sendMessage(chatId, helpText, env);
    }
    else {
      await sendMessage(chatId, `❓ 未知命令: ${text}

━━━━━━━━━━━━━━━━━━━━━━━━━━

请使用以下命令：

🏠 /start
   查看欢迎信息

❓ /help
   查看详细帮助

📰 /list
   查看订阅列表`, env);
    }
  } catch (error) {
    console.error('消息处理错误:', error);
    await sendMessage(chatId, '❌ 抱歉，处理您的请求时出现错误，请稍后重试。', env);
  }
}

// 订阅RSS - 修复重复订阅检测问题
async function subscribeRSS(chatId, userId, rssUrl, env) {
  try {
    // 验证URL格式
    if (!rssUrl || !rssUrl.startsWith('http')) {
      await sendMessage(chatId, `❌ 请提供有效的RSS URL

━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ URL需要以http或https开头

💡 正确示例：
https://example.com/rss.xml`, env);
      return;
    }
    
    // 先检查是否已订阅
    const existingResult = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM subscriptions WHERE chat_id = ? AND rss_url = ?
    `).bind(chatId, rssUrl).first();
    
    if (existingResult.count > 0) {
      await sendMessage(chatId, `❌ 您已经订阅过这个RSS源了

━━━━━━━━━━━━━━━━━━━━━━━━━━

📝 RSS链接：
${rssUrl}

💡 使用 /list 查看所有订阅`, env);
      return;
    }
    
    // 验证RSS源 - 增强兼容性
    let response;
    try {
      // 首先尝试标准请求
      response = await fetch(rssUrl, {
        headers: { 
          'User-Agent': 'TelegramRSSBot/1.0',
          'Accept': 'application/rss+xml, application/xml, text/xml, */*',
          'Cache-Control': 'no-cache'
        },
        timeout: 15000
      });
      
      // 如果失败，尝试不同的User-Agent
      if (!response.ok) {
        response = await fetch(rssUrl, {
          headers: { 
            'User-Agent': 'Mozilla/5.0 (compatible; RSS Reader)',
            'Accept': 'application/rss+xml, application/xml, text/xml, */*'
          },
          timeout: 15000
        });
      }
      
      // 如果还是失败，尝试最简单的请求
      if (!response.ok) {
        response = await fetch(rssUrl, {
          timeout: 15000
        });
      }
    } catch (fetchError) {
      await sendMessage(chatId, `❌ 网络请求失败

━━━━━━━━━━━━━━━━━━━━━━━━━━

📝 RSS链接：
${rssUrl}

🔍 错误信息：${fetchError.message}

💡 可能原因：
• 网络连接问题
• 请求超时
• 服务器暂时不可用

🔧 建议：
• 稍后重试
• 检查链接是否完整正确`, env);
      return;
    }
    
    if (!response.ok) {
      let errorMessage = `❌ 无法访问RSS源

━━━━━━━━━━━━━━━━━━━━━━━━━━

📝 RSS链接：
${rssUrl}

🔍 状态码：${response.status}
📄 状态文本：${response.statusText}`;

      // 根据状态码提供具体建议
      if (response.status === 404) {
        errorMessage += `\n\n💡 404错误建议：
• 检查URL路径是否正确
• 确认RSS服务是否正常运行
• 验证频道/资源是否存在
• 可能存在User-Agent限制`;
      } else if (response.status === 403) {
        errorMessage += `\n\n💡 403错误建议：
• 检查RSS源访问权限
• 确认频道是否为公开频道
• 可能需要特定的请求头`;
      } else if (response.status === 429) {
        errorMessage += `\n\n💡 429错误建议：
• 请求频率过高，请稍后重试
• RSS源可能有访问限制`;
      } else if (response.status >= 500) {
        errorMessage += `\n\n💡 服务器错误建议：
• RSS服务可能暂时不可用
• 请稍后重试`;
      }

      errorMessage += `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━

🔧 调试建议：
• 在浏览器中直接访问该链接
• 检查是否有User-Agent限制
• 尝试稍后重新订阅`;

      await sendMessage(chatId, errorMessage, env);
      return;
    }
    
    const rssContent = await response.text();
    if (!rssContent.includes('<rss') && !rssContent.includes('<feed') && !rssContent.includes('<channel>')) {
      await sendMessage(chatId, `❌ 该URL不是有效的RSS或Atom格式

━━━━━━━━━━━━━━━━━━━━━━━━━━

📝 链接：
${rssUrl}

💡 请确保链接指向RSS或Atom订阅源`, env);
      return;
    }
    
    // 保存订阅
    const result = await env.DB.prepare(`
      INSERT INTO subscriptions (chat_id, user_id, rss_url, created_at) 
      VALUES (?, ?, ?, datetime('now'))
    `).bind(chatId, userId, rssUrl).run();
    
    if (result.success) {
      // 初始化RSS缓存
      await env.RSS_CACHE.put(`last_check_${btoa(rssUrl)}`, Date.now().toString());
      await sendMessage(chatId, `✅ 成功订阅RSS

━━━━━━━━━━━━━━━━━━━━━━━━━━

📝 RSS源：
${rssUrl}

🔄 机器人每2分钟检查更新
📰 有新文章会自动推送`, env);
    } else {
      await sendMessage(chatId, '❌ 订阅失败，请稍后重试', env);
    }
    
  } catch (error) {
    console.error('订阅RSS错误:', error);
    await sendMessage(chatId, `❌ 订阅失败

━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 请检查：
• RSS URL是否正确
• 网络连接是否正常
• RSS源是否可访问`, env);
  }
}

// 批量订阅RSS
async function multiSubscribeRSS(chatId, userId, urls, env) {
  if (urls.length === 0) {
    await sendMessage(chatId, `❌ 请提供要订阅的RSS链接

━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 正确格式：
/multi_subscribe
https://example1.com/rss.xml
https://example2.com/feed.xml`, env);
    return;
  }
  
  let successCount = 0;
  let failedUrls = [];
  let duplicateUrls = [];
  
  await sendMessage(chatId, `🔄 开始批量订阅

━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 总数：${urls.length} 个RSS源
⏱ 正在逐个验证，请稍候...`, env);
  
  for (const url of urls) {
    const trimmedUrl = url.trim();
    if (!trimmedUrl || !trimmedUrl.startsWith('http')) {
      failedUrls.push(`${trimmedUrl} (格式错误)`);
      continue;
    }
    
    try {
      // 检查是否已订阅
      const existingResult = await env.DB.prepare(`
        SELECT COUNT(*) as count FROM subscriptions WHERE chat_id = ? AND rss_url = ?
      `).bind(chatId, trimmedUrl).first();
      
      if (existingResult.count > 0) {
        duplicateUrls.push(trimmedUrl);
        continue;
      }
      
      // 验证RSS源 - 增强兼容性
      let response;
      try {
        // 首先尝试标准请求
        response = await fetch(trimmedUrl, {
          headers: { 
            'User-Agent': 'TelegramRSSBot/1.0',
            'Accept': 'application/rss+xml, application/xml, text/xml, */*',
            'Cache-Control': 'no-cache'
          },
          timeout: 15000
        });
        
        // 如果失败，尝试不同的User-Agent
        if (!response.ok) {
          response = await fetch(trimmedUrl, {
            headers: { 
              'User-Agent': 'Mozilla/5.0 (compatible; RSS Reader)',
              'Accept': 'application/rss+xml, application/xml, text/xml, */*'
            },
            timeout: 15000
          });
        }
        
        // 如果还是失败，尝试最简单的请求
        if (!response.ok) {
          response = await fetch(trimmedUrl, {
            timeout: 15000
          });
        }
      } catch (fetchError) {
        failedUrls.push(`${trimmedUrl} (网络错误: ${fetchError.message})`);
        continue;
      }
      
      if (!response.ok) {
        failedUrls.push(`${trimmedUrl} (状态码: ${response.status})`);
        continue;
      }
      
      const rssContent = await response.text();
      if (!rssContent.includes('<rss') && !rssContent.includes('<feed') && !rssContent.includes('<channel>')) {
        failedUrls.push(`${trimmedUrl} (非RSS格式)`);
        continue;
      }
      
      // 保存订阅
      const result = await env.DB.prepare(`
        INSERT INTO subscriptions (chat_id, user_id, rss_url, created_at) 
        VALUES (?, ?, ?, datetime('now'))
      `).bind(chatId, userId, trimmedUrl).run();
      
      if (result.success) {
        await env.RSS_CACHE.put(`last_check_${btoa(trimmedUrl)}`, Date.now().toString());
        successCount++;
      } else {
        failedUrls.push(`${trimmedUrl} (数据库错误)`);
      }
      
      // 避免请求过快
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      failedUrls.push(`${trimmedUrl} (${error.message})`);
    }
  }
  
  let resultMessage = `📊 批量订阅完成！

━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ 成功订阅：${successCount} 个`;
  
  if (duplicateUrls.length > 0) {
    resultMessage += `\n🔄 已订阅：${duplicateUrls.length} 个`;
  }
  
  if (failedUrls.length > 0) {
    resultMessage += `\n❌ 失败：${failedUrls.length} 个`;
    if (failedUrls.length <= 5) {
      resultMessage += '\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n失败详情：\n' + failedUrls.map(url => `• ${url}`).join('\n');
    }
  }
  
  resultMessage += '\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n🔄 机器人每2分钟检查更新';
  
  await sendMessage(chatId, resultMessage, env);
}

// 显示取消订阅选项
async function showUnsubscribeOptions(chatId, env) {
  try {
    const result = await env.DB.prepare(`
      SELECT rss_url FROM subscriptions 
      WHERE chat_id = ? 
      ORDER BY created_at DESC
    `).bind(chatId).all();
    
    if (result.results.length === 0) {
      await sendMessage(chatId, `📋 您还没有订阅任何RSS源

━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 使用以下命令开始订阅：
🔖 /subscribe <URL> - 订阅单个RSS源
📥 /multi_subscribe - 批量订阅`, env);
      return;
    }
    
    let message = `📦 批量取消订阅

━━━━━━━━━━━━━━━━━━━━━━━━━━

📝 使用方法：

请按以下格式发送要取消的RSS链接
（每行一个）：

/multi_unsubscribe
${result.results.slice(0, 10).map(sub => sub.rss_url).join('\n')}

━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 提示：
• 复制上面的链接，删除不需要取消的
• 每行一个RSS链接
• 或使用 /clear_all 清空所有订阅`;
    
    await sendMessage(chatId, message, env);
  } catch (error) {
    console.error('显示取消订阅选项错误:', error);
    await sendMessage(chatId, '❌ 获取订阅列表失败', env);
  }
}

// 批量取消订阅
async function multiUnsubscribeRSS(chatId, urls, env) {
  if (urls.length === 0) {
    await sendMessage(chatId, `❌ 请提供要取消订阅的RSS链接

━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 正确格式：
/multi_unsubscribe
https://example1.com/rss.xml
https://example2.com/feed.xml`, env);
    return;
  }
  
  let successCount = 0;
  let notFoundUrls = [];
  
  for (const url of urls) {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) continue;
    
    try {
      const result = await env.DB.prepare(`
        DELETE FROM subscriptions WHERE chat_id = ? AND rss_url = ?
      `).bind(chatId, trimmedUrl).run();
      
      if (result.changes > 0) {
        successCount++;
      } else {
        notFoundUrls.push(trimmedUrl);
      }
    } catch (error) {
      notFoundUrls.push(trimmedUrl);
    }
  }
  
  let resultMessage = `📊 批量取消订阅完成！

━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ 成功取消：${successCount} 个`;
  
  if (notFoundUrls.length > 0) {
    resultMessage += `\n❌ 未找到：${notFoundUrls.length} 个`;
  }
  
  await sendMessage(chatId, resultMessage, env);
}

// 确认清空所有订阅
async function confirmClearAll(chatId, env) {
  try {
    const result = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM subscriptions WHERE chat_id = ?
    `).bind(chatId).first();
    
    if (result.count === 0) {
      await sendMessage(chatId, `📋 您当前没有任何订阅

━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 使用以下命令开始订阅：
🔖 /subscribe <URL> - 订阅单个RSS源
📥 /multi_subscribe - 批量订阅`, env);
      return;
    }
    
    const confirmMessage = `⚠️ 确认清空所有订阅

━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 当前订阅数量：${result.count} 个

⚠️ 此操作将删除所有订阅，无法撤销！

━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ 确认清空：/confirm_clear_all
❌ 取消操作：发送其他任意消息`;
    
    await sendMessage(chatId, confirmMessage, env);
  } catch (error) {
    console.error('确认清空错误:', error);
    await sendMessage(chatId, '❌ 操作失败，请稍后重试', env);
  }
}

// 清空所有订阅
async function clearAllSubscriptions(chatId, env) {
  try {
    const result = await env.DB.prepare(`
      DELETE FROM subscriptions WHERE chat_id = ?
    `).bind(chatId).run();
    
    await sendMessage(chatId, `✅ 已清空所有订阅

━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 共删除：${result.changes} 个订阅

💡 可以重新开始订阅RSS源`, env);
  } catch (error) {
    console.error('清空订阅错误:', error);
    await sendMessage(chatId, '❌ 清空失败，请稍后重试', env);
  }
}

// 取消订阅
async function unsubscribeRSS(chatId, rssUrl, env) {
  try {
    const result = await env.DB.prepare(`
      DELETE FROM subscriptions WHERE chat_id = ? AND rss_url = ?
    `).bind(chatId, rssUrl).run();
    
    if (result.changes > 0) {
      await sendMessage(chatId, `✅ 已取消订阅

━━━━━━━━━━━━━━━━━━━━━━━━━━

📝 RSS源：
${rssUrl}`, env);
    } else {
      await sendMessage(chatId, `❌ 未找到该订阅

━━━━━━━━━━━━━━━━━━━━━━━━━━

📝 RSS源：
${rssUrl}

💡 使用 /list 查看当前订阅`, env);
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
      await sendMessage(chatId, `📋 您还没有订阅任何RSS源

━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 使用方法：

🔖 /subscribe <URL>
   订阅单个RSS源

📥 /multi_subscribe
   批量订阅多个RSS源`, env);
      return;
    }
    
    let message = `📋 您的RSS订阅列表

━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 总数：${result.results.length} 个订阅\n\n`;
    
    result.results.forEach((sub, index) => {
      const date = new Date(sub.created_at + 'Z').toLocaleDateString('zh-CN');
      message += `${index + 1}. ${sub.rss_url}\n📅 订阅时间：${date}\n\n`;
    });
    
    message += `━━━━━━━━━━━━━━━━━━━━━━━━━━

🛠 管理订阅：

🗑 /unsubscribe <URL>
   取消单个订阅

📤 /multi_unsubscribe
   批量取消订阅

🗑 /clear_all
   清空所有订阅

━━━━━━━━━━━━━━━━━━━━━━━━━━

🔄 机器人每2分钟检查更新`;
    
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
    // 检查频率控制 - 改为2分钟（120000毫秒）
    const lastCheck = await env.RSS_CACHE.get(lastCheckKey);
    const now = Date.now();
    
    if (lastCheck && (now - parseInt(lastCheck)) < 120000) { // 2分钟内不重复检查
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
    .replace(/<[^>]*>/g, '') // 移除所有HTML/XML标签
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&apos;/g, "'")
    .replace(/&#x[\da-fA-F]+;/g, '') // 移除十六进制实体
    .replace(/&#\d+;/g, '') // 移除数字实体
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
        const message = formatArticleMessage(item, rssUrl);
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
function formatArticleMessage(item, rssUrl) {
  // 使用美化的文章推送格式
  let message = `📰 新文章推送

━━━━━━━━━━━━━━━━━━━━━━━━━━

📝 标题：
${cleanMessageText(item.title)}

━━━━━━━━━━━━━━━━━━━━━━━━━━`;
  
  if (item.description && item.description.length > 0) {
    const desc = cleanMessageText(item.description);
    const shortDesc = desc.length > 150 ? desc.substring(0, 150) + '...' : desc;
    message += `\n\n📄 摘要：\n${shortDesc}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━`;
  }
  
  message += `\n\n🔗 链接：\n${item.link}`;
  
  if (item.pubDate) {
    message += `\n\n⏰ 发布时间：\n${cleanMessageText(item.pubDate)}`;
  }
  
  // 添加RSS源信息
  const shortUrl = rssUrl.length > 50 ? rssUrl.substring(0, 50) + '...' : rssUrl;
  message += `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n📡 来源：${shortUrl}`;
  
  return message;
}

// 发送Telegram消息
async function sendMessage(chatId, text, env) {
  try {
    // 清理消息文本，移除或转义HTML标签
    const cleanText = cleanMessageText(text);
    
    const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: cleanText,
        disable_web_page_preview: true
        // 移除 parse_mode: 'HTML' 来避免解析错误
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('发送消息失败:', errorText);
      
      // 如果仍然失败，尝试发送纯文本版本
      const fallbackResponse = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: "抱歉，消息发送失败。请稍后重试。",
          disable_web_page_preview: true
        }),
      });
      
      if (!fallbackResponse.ok) {
        console.error('备用消息也发送失败');
      }
    }
  } catch (error) {
    console.error('发送消息错误:', error);
  }
}

// 清理消息文本
function cleanMessageText(text) {
  if (!text) return '';
  
  return text
    // 移除所有HTML标签
    .replace(/<[^>]*>/g, '')
    // 转义特殊字符
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    // 移除多余的空白字符
    .replace(/\s+/g, ' ')
    .trim()
    // 限制消息长度（Telegram限制4096字符）
    .substring(0, 4000);
}
