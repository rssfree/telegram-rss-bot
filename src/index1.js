// Cloudflare Workers Telegram RSS Bot
// 增强版本：支持更多RSS格式 + 修复多订阅问题 + 增强网络请求
// 集成XML解析库和更强的RSS处理能力

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
    
    // 测试RSS解析endpoint
    if (url.pathname === '/test-rss' && request.method === 'POST') {
      return testRSSParsing(request, env);
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
        .test-form { background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0; }
        .test-form input { width: 100%; padding: 8px; margin: 5px 0; border: 1px solid #ddd; border-radius: 4px; }
        .test-form button { padding: 10px 20px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; }
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
        <li>🔧 增强RSS格式支持</li>
    </ul>
    
    <h2>🛠️ 设置步骤</h2>
    <ol>
        <li>确保已设置 TELEGRAM_BOT_TOKEN 环境变量</li>
        <li><a href="/setup" class="setup-link">点击这里设置Webhook</a></li>
        <li>在Telegram中找到你的机器人开始使用</li>
    </ol>
    
    <div class="test-form">
        <h3>🧪 RSS测试工具</h3>
        <p>测试RSS链接是否能被正确解析：</p>
        <input type="url" id="rssUrl" placeholder="输入RSS链接，例如: https://example.com/rss.xml">
        <button onclick="testRSS()">测试RSS</button>
        <div id="testResult" style="margin-top: 10px;"></div>
    </div>
    
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
    
    <script>
        async function testRSS() {
            const url = document.getElementById('rssUrl').value;
            const resultDiv = document.getElementById('testResult');
            
            if (!url) {
                resultDiv.innerHTML = '<div style="color: red;">请输入RSS链接</div>';
                return;
            }
            
            resultDiv.innerHTML = '<div style="color: blue;">测试中...</div>';
            
            try {
                const response = await fetch('/test-rss', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ rssUrl: url })
                });
                
                const result = await response.text();
                resultDiv.innerHTML = '<pre style="background: #f4f4f4; padding: 10px; border-radius: 4px; white-space: pre-wrap;">' + result + '</pre>';
            } catch (error) {
                resultDiv.innerHTML = '<div style="color: red;">测试失败: ' + error.message + '</div>';
            }
        }
    </script>
</body>
</html>`;
}

// RSS测试接口
async function testRSSParsing(request, env) {
  try {
    const { rssUrl } = await request.json();
    
    if (!rssUrl) {
      return new Response('请提供RSS URL', { status: 400 });
    }
    
    const result = await fetchAndParseRSS(rssUrl);
    
    return new Response(JSON.stringify(result, null, 2), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(`测试失败: ${error.message}`, { status: 500 });
  }
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

// 全局状态管理 - 修复多订阅问题
const userStates = new Map();

// 处理消息 - 增强状态管理
async function handleMessage(message, env) {
  const chatId = message.chat.id;
  const text = message.text || '';
  const userId = message.from.id;
  const userStateKey = `${chatId}_${userId}`;
  
  try {
    // 检查用户是否在多订阅模式
    if (userStates.has(userStateKey) && userStates.get(userStateKey) === 'multi_subscribe') {
      if (text === '/cancel' || text === 'cancel') {
        userStates.delete(userStateKey);
        await sendMessage(chatId, '❌ 已取消批量订阅', env);
        return;
      }
      
      // 处理多行订阅
      const urls = text.split('\n').map(url => url.trim()).filter(url => url && url.startsWith('http'));
      if (urls.length > 0) {
        userStates.delete(userStateKey);
        await multiSubscribeRSS(chatId, userId, urls, env);
        return;
      } else {
        await sendMessage(chatId, '❌ 请提供有效的RSS链接，每行一个\n或发送 /cancel 取消', env);
        return;
      }
    }
    
    // 检查用户是否在多取消订阅模式
    if (userStates.has(userStateKey) && userStates.get(userStateKey) === 'multi_unsubscribe') {
      if (text === '/cancel' || text === 'cancel') {
        userStates.delete(userStateKey);
        await sendMessage(chatId, '❌ 已取消批量取消订阅', env);
        return;
      }
      
      const urls = text.split('\n').map(url => url.trim()).filter(url => url);
      if (urls.length > 0) {
        userStates.delete(userStateKey);
        await multiUnsubscribeRSS(chatId, urls, env);
        return;
      } else {
        await sendMessage(chatId, '❌ 请提供要取消的RSS链接，每行一个\n或发送 /cancel 取消', env);
        return;
      }
    }
    
    if (text.startsWith('/start')) {
      const welcomeText = `🎉 欢迎使用RSS订阅机器人！

🤖 我可以帮您：
• 订阅RSS源，自动推送新文章
• 管理多个订阅源
• 批量操作订阅

📋 基础命令
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┃ /subscribe <网址>  订阅RSS源
┃ /unsubscribe <网址>  取消订阅
┃ /list  查看订阅列表
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📦 批量操作
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┃ /multi_subscribe  批量订阅
┃ /multi_unsubscribe  批量取消
┃ /clear_all  清空所有订阅
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 示例：
/subscribe https://example.com/rss.xml

输入 /help 查看详细说明`;
      
      await sendMessage(chatId, welcomeText, env);
    }
    else if (text.startsWith('/subscribe ')) {
      const rssUrl = text.replace('/subscribe ', '').trim();
      await subscribeRSS(chatId, userId, rssUrl, env);
    }
    else if (text === '/multi_subscribe') {
      userStates.set(userStateKey, 'multi_subscribe');
      const helpText = `📥 批量订阅RSS源

现在请发送多个RSS链接，每行一个：

https://example1.com/rss.xml
https://example2.com/feed.xml
https://example3.com/atom.xml

💡 提示：
• 每行一个RSS链接
• 支持同时订阅多个源
• 发送 /cancel 取消操作`;
      
      await sendMessage(chatId, helpText, env);
    }
    else if (text.startsWith('/unsubscribe ')) {
      const rssUrl = text.replace('/unsubscribe ', '').trim();
      await unsubscribeRSS(chatId, rssUrl, env);
    }
    else if (text === '/multi_unsubscribe') {
      userStates.set(userStateKey, 'multi_unsubscribe');
      await showUnsubscribeOptions(chatId, env);
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
      const helpText = `📖 RSS订阅机器人使用指南

🔖 基础订阅
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┃ /subscribe <URL>  订阅单个RSS源
┃ /unsubscribe <URL>  取消单个订阅
┃ /list  查看所有订阅
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📦 批量操作
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┃ /multi_subscribe  批量订阅向导
┃ /multi_unsubscribe  批量取消向导
┃ /clear_all  清空所有订阅
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🛠️ 其他功能
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┃ /help  显示此帮助
┃ /start  显示欢迎信息
┃ /cancel  取消当前操作
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚡ 特色功能：
• 自动检查更新（每2分钟）
• 支持RSS和Atom格式
• 智能去重，避免重复推送
• 美化消息格式，阅读体验佳
• 增强网络请求，支持更多RSS源

💡 使用技巧：
• RSS链接必须以http或https开头
• 批量操作进入交互模式，更直观
• 订阅前会自动验证链接有效性
• 支持自定义RSS源和非标准格式`;
      
      await sendMessage(chatId, helpText, env);
    }
    else if (text === '/cancel') {
      if (userStates.has(userStateKey)) {
        userStates.delete(userStateKey);
        await sendMessage(chatId, '✅ 已取消当前操作', env);
      } else {
        await sendMessage(chatId, '💡 当前没有进行中的操作', env);
      }
    }
    else {
      await sendMessage(chatId, `❓ 未知命令：${text}

请使用以下命令：
• /start - 查看欢迎信息
• /help - 查看详细帮助  
• /list - 查看订阅列表`, env);
    }
  } catch (error) {
    console.error('消息处理错误:', error);
    await sendMessage(chatId, '❌ 处理请求时出现错误，请稍后重试', env);
  }
}

// 增强的RSS获取和解析函数
async function fetchAndParseRSS(rssUrl) {
  const fetchOptions = [
    // 选项1：标准RSS请求
    {
      headers: {
        'User-Agent': 'TelegramRSSBot/1.0 (+https://t.me/your_bot)',
        'Accept': 'application/rss+xml, application/xml, text/xml, application/atom+xml, */*',
        'Cache-Control': 'no-cache',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br'
      }
    },
    // 选项2：模拟浏览器
    {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    },
    // 选项3：简单请求
    {
      headers: {
        'User-Agent': 'RSS Reader 1.0',
        'Accept': '*/*',
      }
    },
    // 选项4：无User-Agent
    {
      headers: {
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      }
    }
  ];

  let lastError = null;
  
  for (let i = 0; i < fetchOptions.length; i++) {
    try {
      console.log(`尝试请求方式 ${i + 1}: ${rssUrl}`);
      
      const response = await fetch(rssUrl, {
        ...fetchOptions[i],
        timeout: 20000,
        redirect: 'follow'
      });
      
      console.log(`响应状态: ${response.status}, Content-Type: ${response.headers.get('content-type')}`);
      
      if (response.ok) {
        const contentType = response.headers.get('content-type') || '';
        const content = await response.text();
        
        console.log(`内容长度: ${content.length}, 前100字符: ${content.substring(0, 100)}`);
        
        // 解析RSS内容
        const parseResult = parseRSSContent(content, rssUrl);
        
        if (parseResult.success) {
          return {
            success: true,
            statusCode: response.status,
            contentType: contentType,
            method: i + 1,
            itemCount: parseResult.items.length,
            items: parseResult.items,
            rawContentPreview: content.substring(0, 500)
          };
        } else {
          console.log(`解析失败: ${parseResult.error}`);
          lastError = parseResult.error;
        }
      } else {
        console.log(`HTTP错误 ${response.status}: ${response.statusText}`);
        lastError = `HTTP ${response.status}: ${response.statusText}`;
      }
    } catch (error) {
      console.log(`请求方式 ${i + 1} 失败: ${error.message}`);
      lastError = error.message;
    }
    
    // 在重试之间稍作延迟
    if (i < fetchOptions.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  return {
    success: false,
    error: lastError || '所有请求方式都失败了',
    url: rssUrl
  };
}

// 增强的RSS内容解析
function parseRSSContent(content, rssUrl) {
  const items = [];
  
  try {
    // 检查是否为有效的XML/RSS内容
    const xmlIndicators = ['<?xml', '<rss', '<feed', '<channel>', '<item>', '<entry>'];
    const hasXmlIndicator = xmlIndicators.some(indicator => 
      content.toLowerCase().includes(indicator.toLowerCase())
    );
    
    if (!hasXmlIndicator) {
      return {
        success: false,
        error: '内容不包含XML/RSS格式标识符',
        items: []
      };
    }
    
    // 多种解析策略
    const parsers = [
      () => parseStandardRSS(content, rssUrl),
      () => parseAtomFeed(content, rssUrl),
      () => parseCustomFormat(content, rssUrl),
      () => parseFlexibleFormat(content, rssUrl)
    ];
    
    for (const parser of parsers) {
      try {
        const result = parser();
        if (result.length > 0) {
          return {
            success: true,
            items: result,
            error: null
          };
        }
      } catch (parserError) {
        console.log(`解析器失败: ${parserError.message}`);
      }
    }
    
    return {
      success: false,
      error: '所有解析器都无法处理此内容',
      items: []
    };
    
  } catch (error) {
    return {
      success: false,
      error: `解析错误: ${error.message}`,
      items: []
    };
  }
}

// 标准RSS解析
function parseStandardRSS(content, rssUrl) {
  const items = [];
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let match;
  
  while ((match = itemRegex.exec(content)) !== null) {
    const itemContent = match[1];
    const item = extractItemData(itemContent, rssUrl);
    if (item.title && item.link) {
      items.push(item);
    }
  }
  
  return items.slice(0, 5);
}

// Atom feed解析
function parseAtomFeed(content, rssUrl) {
  const items = [];
  const entryRegex = /<entry[^>]*>([\s\S]*?)<\/entry>/gi;
  let match;
  
  while ((match = entryRegex.exec(content)) !== null) {
    const entryContent = match[1];
    const item = extractAtomData(entryContent, rssUrl);
    if (item.title && item.link) {
      items.push(item);
    }
  }
  
  return items.slice(0, 5);
}

// 自定义格式解析（针对Telegram RSS Worker等）
function parseCustomFormat(content, rssUrl) {
  const items = [];
  
  // 尝试匹配更灵活的结构
  const patterns = [
    /<(?:article|post|message)[^>]*>([\s\S]*?)<\/(?:article|post|message)>/gi,
    /<(?:div|section)[^>]*class=["'][^"']*(?:item|entry|article)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|section)>/gi
  ];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const itemContent = match[1];
      const item = extractItemData(itemContent, rssUrl);
      if (item.title && item.link) {
        items.push(item);
      }
    }
    if (items.length > 0) break;
  }
  
  return items.slice(0, 5);
}

// 灵活格式解析（最后的尝试）
function parseFlexibleFormat(content, rssUrl) {
  const items = [];
  
  try {
    // 查找所有标题和链接
    const titleMatches = [...content.matchAll(/<title[^>]*>([^<]+)<\/title>/gi)];
    const linkMatches = [...content.matchAll(/<link[^>]*>([^<]*)<\/link>|<link[^>]*href=["']([^"']+)["'][^>]*>/gi)];
    
    // 跳过第一个title（通常是频道标题）
    for (let i = 1; i < titleMatches.length && i <= linkMatches.length; i++) {
      const title = cleanText(titleMatches[i][1]);
      const linkMatch = linkMatches[i - 1];
      let link = linkMatch[1] || linkMatch[2] || '';
      
      // 处理相对链接
  if (link && !link.startsWith('http')) {
    try {
      const baseUrl = new URL(rssUrl);
      link = new URL(link, baseUrl).href;
    } catch (e) {
      // 无法处理的相对链接
    }
  }
  
  return {
    title: cleanText(title),
    link: link ? link.trim() : '',
    description: cleanText(description || ''),
    pubDate: cleanText(pubDate || '')
  };
}

// 提取Atom数据
function extractAtomData(entryContent, rssUrl) {
  const title = extractTag(entryContent, 'title');
  let link = extractAttribute(entryContent, 'link', 'href') || extractTag(entryContent, 'link');
  const summary = extractTag(entryContent, 'summary') || extractTag(entryContent, 'content');
  const updated = extractTag(entryContent, 'updated') || extractTag(entryContent, 'published');
  
  // 处理相对链接
  if (link && !link.startsWith('http')) {
    try {
      const baseUrl = new URL(rssUrl);
      link = new URL(link, baseUrl).href;
    } catch (e) {
      // 无法处理的相对链接
    }
  }
  
  return {
    title: cleanText(title),
    link: link ? link.trim() : '',
    description: cleanText(summary || ''),
    pubDate: cleanText(updated || '')
  };
}

// 订阅RSS - 使用增强的解析器
async function subscribeRSS(chatId, userId, rssUrl, env) {
  try {
    // 验证URL格式
    if (!rssUrl || !rssUrl.startsWith('http')) {
      await sendMessage(chatId, `❌ 请提供有效的RSS URL

💡 URL需要以http或https开头
示例：https://example.com/rss.xml`, env);
      return;
    }
    
    // 检查是否已订阅
    const existingResult = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM subscriptions WHERE chat_id = ? AND rss_url = ?
    `).bind(chatId, rssUrl).first();
    
    if (existingResult.count > 0) {
      await sendMessage(chatId, `⚠️ 已订阅此RSS源

📝 ${rssUrl}

使用 /list 查看所有订阅`, env);
      return;
    }
    
    // 发送验证中的消息
    await sendMessage(chatId, `🔄 正在验证RSS源...

📝 ${rssUrl}

⏱️ 请稍候，正在尝试多种方式访问...`, env);
    
    // 使用增强的RSS获取和解析
    const result = await fetchAndParseRSS(rssUrl);
    
    if (!result.success) {
      let errorMessage = `❌ RSS源验证失败

📝 ${rssUrl}

🔍 错误信息：${result.error}`;

      if (result.rawContentPreview) {
        errorMessage += `\n\n📄 内容预览：\n${result.rawContentPreview.substring(0, 200)}...`;
      }

      errorMessage += `\n\n💡 可能的解决方案：
• 检查URL是否正确
• 确认RSS源是否公开可访问
• 尝试在浏览器中直接访问该链接
• 确认链接返回的是XML/RSS格式`;

      await sendMessage(chatId, errorMessage, env);
      return;
    }
    
    // 保存订阅
    const dbResult = await env.DB.prepare(`
      INSERT INTO subscriptions (chat_id, user_id, rss_url, created_at) 
      VALUES (?, ?, ?, datetime('now'))
    `).bind(chatId, userId, rssUrl).run();
    
    if (dbResult.success) {
      await env.RSS_CACHE.put(`last_check_${btoa(rssUrl)}`, Date.now().toString());
      
      let successMessage = `✅ 订阅成功！

📰 RSS源：${rssUrl}

📊 解析结果：
• 使用方式：${result.method}
• 发现文章：${result.itemCount} 篇
• 内容类型：${result.contentType}

🔄 每2分钟自动检查更新`;

      if (result.items.length > 0) {
        successMessage += `\n\n📝 最新文章预览：\n${result.items[0].title}`;
      }

      await sendMessage(chatId, successMessage, env);
    } else {
      await sendMessage(chatId, '❌ 订阅保存失败，请稍后重试', env);
    }
    
  } catch (error) {
    console.error('订阅RSS错误:', error);
    await sendMessage(chatId, `❌ 订阅失败

💡 请检查：
• RSS URL是否正确
• 网络连接是否正常

🔍 错误详情：${error.message}`, env);
  }
}

// 批量订阅RSS - 修复状态管理问题
async function multiSubscribeRSS(chatId, userId, urls, env) {
  if (urls.length === 0) {
    await sendMessage(chatId, `❌ 未找到有效的RSS链接

💡 请确保：
• 每行一个链接
• 链接以http或https开头`, env);
    return;
  }
  
  let successCount = 0;
  let failedUrls = [];
  let duplicateUrls = [];
  
  await sendMessage(chatId, `🔄 开始批量订阅

📊 共 ${urls.length} 个链接
⏱️ 正在逐个验证，预计需要 ${urls.length * 2} 秒...`, env);
  
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    
    try {
      // 发送进度更新
      if (i > 0 && i % 3 === 0) {
        await sendMessage(chatId, `📊 进度：${i}/${urls.length} (${Math.round(i/urls.length*100)}%)`, env);
      }
      
      // 检查是否已订阅
      const existingResult = await env.DB.prepare(`
        SELECT COUNT(*) as count FROM subscriptions WHERE chat_id = ? AND rss_url = ?
      `).bind(chatId, url).first();
      
      if (existingResult.count > 0) {
        duplicateUrls.push(url);
        continue;
      }
      
      // 验证RSS源
      const result = await fetchAndParseRSS(url);
      
      if (!result.success) {
        failedUrls.push(`${url} (${result.error})`);
        continue;
      }
      
      // 保存订阅
      const dbResult = await env.DB.prepare(`
        INSERT INTO subscriptions (chat_id, user_id, rss_url, created_at) 
        VALUES (?, ?, ?, datetime('now'))
      `).bind(chatId, userId, url).run();
      
      if (dbResult.success) {
        await env.RSS_CACHE.put(`last_check_${btoa(url)}`, Date.now().toString());
        successCount++;
      } else {
        failedUrls.push(`${url} (数据库保存失败)`);
      }
      
      // 避免请求过快
      await new Promise(resolve => setTimeout(resolve, 1500));
      
    } catch (error) {
      failedUrls.push(`${url} (${error.message})`);
    }
  }
  
  let resultMessage = `📊 批量订阅完成！

✅ 成功订阅：${successCount} 个`;
  
  if (duplicateUrls.length > 0) {
    resultMessage += `\n🔄 已存在：${duplicateUrls.length} 个`;
  }
  
  if (failedUrls.length > 0) {
    resultMessage += `\n❌ 失败：${failedUrls.length} 个`;
    if (failedUrls.length <= 3) {
      resultMessage += '\n\n失败详情：\n' + failedUrls.map(url => `• ${url}`).join('\n');
    }
  }
  
  resultMessage += '\n\n🔄 机器人将每2分钟检查更新';
  
  await sendMessage(chatId, resultMessage, env);
}

// 显示取消订阅选项 - 修复交互模式
async function showUnsubscribeOptions(chatId, env) {
  try {
    const result = await env.DB.prepare(`
      SELECT rss_url FROM subscriptions 
      WHERE chat_id = ? 
      ORDER BY created_at DESC
    `).bind(chatId).all();
    
    if (result.results.length === 0) {
      await sendMessage(chatId, `📋 暂无订阅

💡 开始订阅：
• /subscribe <URL> - 单个订阅
• /multi_subscribe - 批量订阅`, env);
      return;
    }
    
    let message = `📤 批量取消订阅

请发送要取消的RSS链接，每行一个：

${result.results.slice(0, 15).map((sub, index) => `${index + 1}. ${sub.rss_url}`).join('\n')}

💡 操作提示：
• 复制需要取消的链接，每行一个
• 发送 /cancel 取消此操作
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
    await sendMessage(chatId, `❌ 请提供要取消的RSS链接

💡 每行一个链接`, env);
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
  
  let resultMessage = `📊 批量取消完成

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
      await sendMessage(chatId, `📋 当前没有任何订阅

💡 开始订阅：
• /subscribe <URL>
• /multi_subscribe`, env);
      return;
    }
    
    const confirmMessage = `⚠️ 确认清空所有订阅？

📊 当前订阅：${result.count} 个

❗ 此操作无法撤销

✅ 确认：/confirm_clear_all
❌ 取消：发送其他消息`;
    
    await sendMessage(chatId, confirmMessage, env);
  } catch (error) {
    console.error('确认清空错误:', error);
    await sendMessage(chatId, '❌ 操作失败', env);
  }
}

// 清空所有订阅
async function clearAllSubscriptions(chatId, env) {
  try {
    const result = await env.DB.prepare(`
      DELETE FROM subscriptions WHERE chat_id = ?
    `).bind(chatId).run();
    
    await sendMessage(chatId, `✅ 已清空所有订阅

📊 共删除：${result.changes} 个

💡 可重新开始订阅`, env);
  } catch (error) {
    console.error('清空订阅错误:', error);
    await sendMessage(chatId, '❌ 清空失败', env);
  }
}

// 取消订阅
async function unsubscribeRSS(chatId, rssUrl, env) {
  try {
    const result = await env.DB.prepare(`
      DELETE FROM subscriptions WHERE chat_id = ? AND rss_url = ?
    `).bind(chatId, rssUrl).run();
    
    if (result.changes > 0) {
      await sendMessage(chatId, `✅ 取消订阅成功

📝 ${rssUrl}`, env);
    } else {
      await sendMessage(chatId, `❌ 未找到该订阅

📝 ${rssUrl}

使用 /list 查看当前订阅`, env);
    }
  } catch (error) {
    console.error('取消订阅错误:', error);
    await sendMessage(chatId, '❌ 操作失败', env);
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
      await sendMessage(chatId, `📋 暂无订阅

💡 开始订阅：
• /subscribe <URL> - 单个订阅
• /multi_subscribe - 批量订阅`, env);
      return;
    }
    
    let message = `📋 我的订阅列表

📊 共 ${result.results.length} 个订阅

`;
    
    result.results.forEach((sub, index) => {
      const date = new Date(sub.created_at + 'Z').toLocaleDateString('zh-CN');
      const shortUrl = sub.rss_url.length > 50 ? 
        sub.rss_url.substring(0, 50) + '...' : sub.rss_url;
      message += `${index + 1}. ${shortUrl}\n📅 ${date}\n\n`;
    });
    
    message += `🛠️ 管理订阅：
• /unsubscribe <URL> - 取消单个
• /multi_unsubscribe - 批量取消
• /clear_all - 清空所有

🔄 每2分钟自动检查更新`;
    
    await sendMessage(chatId, message, env);
    
  } catch (error) {
    console.error('获取订阅列表错误:', error);
    await sendMessage(chatId, '❌ 获取列表失败', env);
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
        await new Promise(resolve => setTimeout(resolve, 2000)); // 增加延迟
      } catch (error) {
        console.error(`检查RSS ${row.rss_url} 失败:`, error);
      }
    }
    
    console.log('RSS检查完成');
  } catch (error) {
    console.error('检查RSS源错误:', error);
  }
}

// 检查单个RSS源 - 使用增强解析器
async function checkRSSFeed(rssUrl, env) {
  const lastCheckKey = `last_check_${btoa(rssUrl)}`;
  const lastItemsKey = `last_items_${btoa(rssUrl)}`;
  
  try {
    // 检查频率控制 - 2分钟
    const lastCheck = await env.RSS_CACHE.get(lastCheckKey);
    const now = Date.now();
    
    if (lastCheck && (now - parseInt(lastCheck)) < 120000) {
      return;
    }
    
    // 使用增强的RSS获取
    const result = await fetchAndParseRSS(rssUrl);
    
    if (!result.success) {
      console.error(`RSS源检查失败: ${rssUrl}, 错误: ${result.error}`);
      return;
    }
    
    const items = result.items;
    
    if (items.length === 0) {
      console.log(`RSS源无新内容: ${rssUrl}`);
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
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
  } catch (error) {
    console.error('通知订阅者错误:', error);
  }
}

// 格式化文章消息 - 优化版本
function formatArticleMessage(item, rssUrl) {
  // 获取域名作为来源标识
  let sourceName = '';
  try {
    const urlObj = new URL(rssUrl);
    sourceName = urlObj.hostname.replace('www.', '');
  } catch (e) {
    sourceName = rssUrl.length > 40 ? rssUrl.substring(0, 40) + '...' : rssUrl;
  }
  
  // 格式化发布时间
  let timeStr = '';
  if (item.pubDate) {
    try {
      const date = new Date(item.pubDate);
      if (!isNaN(date.getTime())) {
        timeStr = date.toLocaleString('zh-CN', { 
          month: 'numeric', 
          day: 'numeric', 
          hour: '2-digit', 
          minute: '2-digit' 
        });
      }
    } catch (e) {
      // 时间解析失败则不显示
    }
  }
  
  // 构建消息
  let message = `📰 新文章推送\n\n`;
  
  // 标题
  message += `${cleanMessageText(item.title)}\n\n`;
  
  // 摘要（如果有）
  if (item.description && item.description.length > 0) {
    const desc = cleanMessageText(item.description);
    const shortDesc = desc.length > 120 ? desc.substring(0, 120) + '...' : desc;
    if (shortDesc.trim()) {
      message += `💬 ${shortDesc}\n\n`;
    }
  }
  
  // 链接
  message += `🔗 ${item.link}\n\n`;
  
  // 底部信息
  let footer = `📡 ${sourceName}`;
  if (timeStr) {
    footer += ` • ⏰ ${timeStr}`;
  }
  message += footer;
  
  return message;
}

// 发送Telegram消息
async function sendMessage(chatId, text, env) {
  try {
    // 清理消息文本
    const cleanText = cleanMessageText(text);
    
    const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: cleanText,
        disable_web_page_preview: true
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('发送消息失败:', errorText);
      
      // 如果失败，尝试发送简化版本
      const fallbackResponse = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: "消息发送失败，请稍后重试",
          disable_web_page_preview: true
        }),
      });
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
    // 限制消息长度
    .substring(0, 4000);
}链接
      if (link && !link.startsWith('http')) {
        try {
          const baseUrl = new URL(rssUrl);
          link = new URL(link, baseUrl).href;
        } catch (e) {
          continue;
        }
      }
      
      if (title && link && link.startsWith('http')) {
        items.push({
          title: title,
          link: link,
          description: '',
          pubDate: ''
        });
      }
    }
  } catch (error) {
    console.log(`灵活解析失败: ${error.message}`);
  }
  
  return items.slice(0, 5);
}

// 提取项目数据
function extractItemData(itemContent, rssUrl) {
  const title = extractTag(itemContent, 'title');
  let link = extractTag(itemContent, 'link') || extractAttribute(itemContent, 'link', 'href');
  const description = extractTag(itemContent, 'description') || 
                     extractTag(itemContent, 'summary') || 
                     extractTag(itemContent, 'content') ||
                     extractTag(itemContent, 'content:encoded');
  const pubDate = extractTag(itemContent, 'pubDate') || 
                 extractTag(itemContent, 'published') || 
                 extractTag(itemContent, 'updated') ||
                 extractTag(itemContent, 'date');
  
  // 处理相对
