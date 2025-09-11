export class RSSParser {
  constructor() {
    // 移除无用的公共RSS代理服务列表
    // 添加访问频率控制
    this.rateLimitMap = new Map(); // 记录每个URL的访问时间和失败次数
  }

  async parseRSS(url) {
    // 检查访问频率限制
    if (this.isRateLimited(url)) {
      console.log(`跳过 ${url} - 访问频率限制中`);
      return [];
    }

    const maxRetries = 4; // 增加重试次数
    let lastError;
    
    // 特殊网站预处理
    if (url.includes('hostloc.com') || url.includes('linux.do')) {
      console.log(`🎯 检测到高风险反爬虫网站: ${url}，启用强化策略`);
    }
    
    // 尝试多种访问策略
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔄 RSS解析尝试 ${attempt}/${maxRetries}: ${url}`);
        
        const response = await this.fetchWithHeaders(url, attempt);

        if (response.ok) {
          const xmlText = await response.text();
          
          // 检查响应内容是否有效
          if (!xmlText || xmlText.trim().length === 0) {
            throw new Error('服务器返回空内容');
          }
          
          // 检查是否为错误页面
          if (xmlText.includes('<title>403 Forbidden</title>') || 
              xmlText.includes('<title>Access Denied</title>') ||
              (xmlText.includes('Cloudflare') && xmlText.includes('blocked')) ||
              xmlText.includes('Just a moment') || // Cloudflare 验证页面
              xmlText.includes('DDoS protection by Cloudflare')) {
            throw new Error('返回的是错误页面或验证页面，非有效RSS内容');
          }
          
          // 预处理XML内容
          const cleanedXML = this.preprocessXML(xmlText);
          const items = this.parseXML(cleanedXML);
          
          if (items.length > 0) {
            // 成功访问，重置失败计数
            this.recordSuccess(url);
            console.log(`✅ 成功解析 ${url}，获得 ${items.length} 个条目`);
            return items;
          } else {
            // 尝试检测特殊格式
            const specialItems = await this.trySpecialFormats(url, cleanedXML);
            if (specialItems.length > 0) {
              this.recordSuccess(url);
              console.log(`✅ 使用特殊格式解析 ${url}，获得 ${specialItems.length} 个条目`);
              return specialItems;
            }
            
            // 检查是否为空的但有效的RSS
            if (this.isValidEmptyRSS(cleanedXML)) {
              console.log(`⚠️ 检测到空的但有效的RSS: ${url}`);
              return [];
            }
            
            throw new Error('解析的RSS中没有找到任何有效条目');
          }
        } else if (response.status === 429) {
          // 429错误特殊处理
          console.warn(`⚠️ 访问频率限制 ${url}, 设置更长的冷却时间`);
          this.recordRateLimit(url);
          throw new Error('访问频率过高，请稍后再试');
        } else if (response.status === 403) {
          console.warn(`⚠️ 直接访问被拒绝 ${url}, 尝试次数: ${attempt}`);
          if (attempt >= maxRetries) {
            throw new Error('所有访问策略都被拒绝，请检查RSS源是否需要特殊权限');
          }
          // 继续重试使用不同User-Agent
        } else if (response.status === 418) {
          console.warn(`⚠️ 检测到反爬虫机制 ${url}, 尝试次数: ${attempt}`);
          if (attempt >= maxRetries) {
            throw new Error('网站反爬虫机制过于严格，无法获取RSS内容');
          }
          // 继续重试使用更隐蔽的策略
        } else {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      } catch (error) {
        lastError = error;
        console.warn(`❌ RSS解析尝试 ${attempt}/${maxRetries} 失败 ${url}: ${error.message}`);
        
        // 对于特殊错误，提前终止重试
        if (error.message.includes('访问频率过高') || 
            error.message.includes('频率限制')) {
          break; // 频率限制直接退出，不重试
        }
        
        // 动态调整重试延迟
        if (attempt < maxRetries) {
          const retryDelay = this.calculateRetryDelay(attempt, url);
          console.log(`⏳ 等待 ${retryDelay}ms 后进行下一次尝试...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
    }
    
    // 记录失败
    this.recordFailure(url);
    const errorMsg = lastError?.message || 'Unknown error';
    console.error(`❌ 所有尝试都失败了 ${url}: ${errorMsg}`);
    
    // 生成更友好的错误信息
    const domain = new URL(url).hostname;
    if (errorMsg.includes('反爬虫') || errorMsg.includes('418')) {
      console.log(`⚠️ 跳过 ${domain} - 网站反爬虫机制太严格`);
    } else if (errorMsg.includes('访问被拒绝') || errorMsg.includes('403')) {
      console.log(`⚠️ 跳过 ${domain} - 访问被限制`);
    } else if (errorMsg.includes('频率限制') || errorMsg.includes('429')) {
      console.log(`⚠️ 跳过 ${domain} - 访问频率过高`);
    } else {
      console.log(`⚠️ 跳过 ${domain} - 无新内容或访问被限制`);
    }
    
    return [];
  }

  // 检查是否被频率限制
  isRateLimited(url) {
    const record = this.rateLimitMap.get(url);
    if (!record) return false;
    
    const now = Date.now();
    const timeSinceLastAccess = now - record.lastAccess;
    
    // 根据失败次数和错误类型设置不同的冷却时间
    let cooldownTime = 60000; // 默认1分钟
    
    if (record.rateLimitCount > 0) {
      // 429错误：指数退避策略
      cooldownTime = Math.min(300000 * Math.pow(2, record.rateLimitCount), 3600000); // 5分钟到1小时
    } else if (record.failureCount > 0) {
      // 其他错误：线性退避策略
      cooldownTime = Math.min(120000 * record.failureCount, 1800000); // 2分钟到30分钟
    }
    
    return timeSinceLastAccess < cooldownTime;
  }

  // 记录成功访问
  recordSuccess(url) {
    this.rateLimitMap.set(url, {
      lastAccess: Date.now(),
      failureCount: 0,
      rateLimitCount: 0,
      successCount: (this.rateLimitMap.get(url)?.successCount || 0) + 1
    });
  }

  // 记录失败访问
  recordFailure(url) {
    const record = this.rateLimitMap.get(url) || {
      lastAccess: 0,
      failureCount: 0,
      rateLimitCount: 0,
      successCount: 0
    };
    
    record.lastAccess = Date.now();
    record.failureCount++;
    
    this.rateLimitMap.set(url, record);
  }

  // 记录频率限制
  recordRateLimit(url) {
    const record = this.rateLimitMap.get(url) || {
      lastAccess: 0,
      failureCount: 0,
      rateLimitCount: 0,
      successCount: 0
    };
    
    record.lastAccess = Date.now();
    record.rateLimitCount++;
    
    this.rateLimitMap.set(url, record);
  }

  // 获取访问统计信息
  getAccessStats(url) {
    return this.rateLimitMap.get(url) || {
      lastAccess: 0,
      failureCount: 0,
      rateLimitCount: 0,
      successCount: 0
    };
  }

  // 移除 tryProxyServices 方法

  // 移除 convertJsonToItems 方法

  async fetchWithHeaders(url, attempt = 1) {
    // 根据尝试次数和URL特征使用不同的请求策略
    const strategies = await this.getAdvancedStrategies(url, attempt);
    const strategy = strategies[Math.min(attempt - 1, strategies.length - 1)];
    
    // 针对高风险网站进行会话预热
    if (attempt === 1 && (url.includes('hostloc.com') || url.includes('linux.do'))) {
      await this.performSessionWarmup(url, strategy);
    }

    // 动态调整延迟时间，防止被识别为机器人
    if (attempt > 1) {
      const baseDelay = Math.random() * 2000 + 3000; // 3-5秒基础延迟
      const exponentialDelay = Math.pow(2, attempt - 1) * 1000; // 指数延迟
      const totalDelay = Math.min(baseDelay + exponentialDelay, 15000); // 最多15秒
      console.log(`第${attempt}次尝试前等待 ${Math.round(totalDelay)}ms`);
      await new Promise(resolve => setTimeout(resolve, totalDelay));
    }

    // 使用AbortController实现超时控制
    const controller = new AbortController();
    const timeoutMs = attempt > 2 ? 30000 : 25000; // 后续尝试更长超时
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: strategy.headers,
        redirect: 'follow',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      // 特殊状态码处理和智能重试
      if (response.status === 418) {
        console.log(`检测到418状态码 (I'm a teapot) - ${url}，这是反爬虫机制`);
        if (attempt < 3) {
          throw new Error('服务器检测到自动化访问，将尝试更隐蔽的方式');
        } else {
          throw new Error('服务器检测到自动化访问，请稍后再试');
        }
      }
      
      if (response.status === 403) {
        console.log(`检测到403状态码 - ${url}，尝试更换策略`);
        if (attempt < 3) {
          throw new Error('访问被拒绝，将尝试其他策略');
        } else {
          throw new Error('访问被拒绝，请检查链接或稍后再试');
        }
      }
      
      if (response.status === 429) {
        console.log(`检测到429状态码 (频率限制) - ${url}`);
        const retryAfter = response.headers.get('Retry-After');
        const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 60000;
        if (attempt < 3) {
          throw new Error(`频率限制，将在${Math.round(waitTime/1000)}秒后重试`);
        }
      }
      
      // 其他客户端错误
      if (response.status >= 400 && response.status < 500) {
        if (attempt < 3) {
          throw new Error(`HTTP ${response.status}，将尝试不同的访问方式`);
        }
      }
      
      // 服务器错误
      if (response.status >= 500) {
        if (attempt < 3) {
          throw new Error(`服务器错误 ${response.status}，稍后重试`);
        }
      }
      
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('请求超时');
      }
      throw error;
    }
  }

  // 会话预热 - 模拟真实用户先访问主页
  async performSessionWarmup(url, strategy) {
    try {
      const domain = new URL(url).hostname;
      const baseUrl = `https://${domain}`;
      
      console.log(`执行会话预热: ${baseUrl}`);
      
      // 使用简化的请求头访问主页
      const warmupHeaders = {
        'User-Agent': strategy.headers['User-Agent'],
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': strategy.headers['Accept-Language'] || 'zh-CN,zh;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      };
      
      const warmupController = new AbortController();
      const warmupTimeout = setTimeout(() => warmupController.abort(), 10000);
      
      await fetch(baseUrl, {
        method: 'GET',
        headers: warmupHeaders,
        redirect: 'follow',
        signal: warmupController.signal
      });
      
      clearTimeout(warmupTimeout);
      
      // 模拟用户阅读时间
      const readTime = Math.random() * 3000 + 2000; // 2-5秒
      await new Promise(resolve => setTimeout(resolve, readTime));
      
      console.log(`会话预热完成，模拟阅读 ${Math.round(readTime)}ms`);
      
    } catch (error) {
      console.log(`会话预热失败，继续访问RSS: ${error.message}`);
      // 预热失败不影响后续流程
    }
  }

  // 获取高级请求策略
  async getAdvancedStrategies(url, attempt) {
    const baseStrategies = [
      {
        // 策略1: 极致浏览器模拟 (最新Chrome)
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,zh-TW;q=0.7',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="121", "Google Chrome";v="121"',
          'Sec-Ch-Ua-Mobile': '?0',
          'Sec-Ch-Ua-Platform': '"Windows"',
          'sec-ch-ua-arch': '"x86"',
          'sec-ch-ua-bitness': '"64"',
          'sec-ch-ua-full-version': '"121.0.6167.85"',
          'Cache-Control': 'max-age=0'
        }
      },
      {
        // 策略2: 高级Firefox模拟
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'TE': 'trailers'
        }
      },
      {
        // 策略3: 伪装成常见RSS客户端
        headers: {
          'User-Agent': 'NewsBlur Feed Fetcher - www.newsblur.com',
          'Accept': 'application/rss+xml, application/xml, text/xml, application/atom+xml, */*',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate'
        }
      },
      {
        // 策略4: 移动端Chrome模拟
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="121", "Google Chrome";v="121"',
          'Sec-Ch-Ua-Mobile': '?1',
          'Sec-Ch-Ua-Platform': '"Android"'
        }
      },
      {
        // 策略5: 搜索引擎爬虫伪装
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
          'Accept': '*/*',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive'
        }
      }
    ];

    // 针对特定网站的极致反爬虫策略
    if (url.includes('hostloc.com')) {
      // HostLoc强化策略 - 多层次反检测
      const hostlocStrategies = [
        {
          // 策略1: 完整用户会话模拟
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Referer': 'https://www.hostloc.com/',
            'Origin': 'https://www.hostloc.com',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'same-origin',
            'Sec-Fetch-User': '?1',
            'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="121", "Google Chrome";v="121"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"',
            'Cache-Control': 'max-age=0',
            'X-Requested-With': 'XMLHttpRequest'
          }
        },
        {
          // 策略2: 论坛专用RSS阅读器
          headers: {
            'User-Agent': 'Tiny Tiny RSS/23.12 (https://tt-rss.org/)',
            'Accept': 'application/rss+xml, application/xml, text/xml, */*',
            'Accept-Language': 'zh-CN,zh;q=0.9',
            'Accept-Encoding': 'gzip, deflate',
            'Referer': 'https://hostloc.com/forum.php',
            'X-Forwarded-For': '1.2.4.8',
            'X-Real-IP': '1.2.4.8'
          }
        },
        {
          // 策略3: 老版本浏览器伪装
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.8,en-US;q=0.5,en;q=0.3',
            'Accept-Encoding': 'gzip, deflate',
            'Referer': 'https://hostloc.com/',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
          }
        }
      ];
      return hostlocStrategies.concat(baseStrategies);
    }

    if (url.includes('linux.do')) {
      // Linux.do (Discourse) 强化策略
      const linuxdoStrategies = [
        {
          // 策略1: Discourse API专用
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Accept': 'application/rss+xml, application/xml, text/xml, */*',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Referer': 'https://linux.do/latest',
            'Origin': 'https://linux.do',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin',
            'X-Requested-With': 'XMLHttpRequest',
            'Discourse-Present': 'true',
            'X-CSRF-Token': 'undefined'
          }
        },
        {
          // 策略2: 社区RSS阅读器
          headers: {
            'User-Agent': 'FreshRSS/1.21.0 (Linux; https://freshrss.org)',
            'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'Referer': 'https://linux.do/',
            'X-Forwarded-For': '8.8.8.8'
          }
        },
        {
          // 策略3: 移动端访问
          headers: {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh-Hans;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Referer': 'https://linux.do/',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
          }
        }
      ];
      return linuxdoStrategies.concat(baseStrategies);
    }

    return baseStrategies;
  }

  /**
   * 预处理XML内容，修复常见问题
   */
  preprocessXML(xmlText) {
    let cleaned = xmlText.trim();
    
    // 移除BOM标记
    if (cleaned.charCodeAt(0) === 0xFEFF) {
      cleaned = cleaned.substring(1);
    }
    
    // 修复常见的编码问题
    cleaned = cleaned.replace(/\x00/g, ''); // 移除null字符
    
    // 修复不规范的XML声明
    if (!cleaned.startsWith('<?xml') && (cleaned.includes('<rss') || cleaned.includes('<feed'))) {
      cleaned = '<?xml version="1.0" encoding="UTF-8"?>\n' + cleaned;
    }
    
    // 修复HTML实体编码问题
    cleaned = this.fixHTMLEntities(cleaned);
    
    return cleaned;
  }

  /**
   * 修复HTML实体编码
   */
  fixHTMLEntities(text) {
    return text
      .replace(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/g, '&amp;')
      .replace(/</g, (match, offset, string) => {
        // 只转义不在标签内的 < 符号
        const nextTag = string.indexOf('>', offset);
        const nextLt = string.indexOf('<', offset + 1);
        if (nextTag === -1 || (nextLt !== -1 && nextLt < nextTag)) {
          return '&lt;';
        }
        return match;
      });
  }

  /**
   * 尝试特殊格式解析
   */
  async trySpecialFormats(url, xmlText) {
    const items = [];
    
    try {
      // 尝试解析JSON Feed
      if (xmlText.trim().startsWith('{')) {
        const jsonItems = this.parseJSONFeed(xmlText);
        if (jsonItems.length > 0) {
          console.log(`检测到JSON Feed格式: ${url}`);
          return jsonItems;
        }
      }
      
      // 尝试解析Discourse RSS (linux.do)
      if (url.includes('linux.do') || url.includes('discourse')) {
        const discourseItems = this.parseDiscourseRSS(xmlText);
        if (discourseItems.length > 0) {
          console.log(`使用Discourse RSS解析器: ${url}`);
          return discourseItems;
        }
      }
      
      // 尝试解析论坛RSS (hostloc)
      if (url.includes('hostloc') || url.includes('forum.php')) {
        const forumItems = this.parseForumRSS(xmlText);
        if (forumItems.length > 0) {
          console.log(`使用论坛RSS解析器: ${url}`);
          return forumItems;
        }
      }
      
    } catch (error) {
      console.warn(`特殊格式解析失败: ${error.message}`);
    }
    
    return items;
  }

  /**
   * 解析JSON Feed格式
   */
  parseJSONFeed(jsonText) {
    try {
      const feed = JSON.parse(jsonText);
      const items = [];
      
      if (feed.items && Array.isArray(feed.items)) {
        for (const item of feed.items.slice(0, 10)) {
          items.push({
            title: item.title || '',
            link: item.url || item.external_url || '',
            description: this.stripHTML(item.content_text || item.content_html || item.summary || '').substring(0, 200),
            guid: item.id || item.url || item.title,
            publishedAt: item.date_published ? new Date(item.date_published).toLocaleString('zh-CN') : ''
          });
        }
      }
      
      return items;
    } catch (error) {
      return [];
    }
  }

  /**
   * 解析Discourse RSS格式
   */
  parseDiscourseRSS(xmlText) {
    const items = [];
    
    // Discourse可能使用特殊的XML结构
    try {
      // 尝试使用更宽松的匹配模式
      const itemMatches = xmlText.match(/<item[^>]*>[\s\S]*?<\/item>/gi) ||
                         xmlText.match(/<entry[^>]*>[\s\S]*?<\/entry>/gi);
      
      if (itemMatches) {
        for (const itemXml of itemMatches.slice(0, 10)) {
          const item = this.parseRSSItem(itemXml);
          if (item.title) {
            items.push(item);
          }
        }
      }
    } catch (error) {
      console.warn('Discourse RSS解析失败:', error.message);
    }
    
    return items;
  }

  /**
   * 解析论坛RSS格式
   */
  parseForumRSS(xmlText) {
    const items = [];
    
    try {
      // 论坛RSS可能有特殊的编码或结构
      // 先尝试修复常见的论坛RSS问题
      let fixedXml = xmlText
        .replace(/&(?![a-zA-Z0-9#]+;)/g, '&amp;') // 修复未转义的&
        .replace(/encoding="gb2312"/i, 'encoding="utf-8"'); // 修复编码声明
      
      const itemMatches = fixedXml.match(/<item[^>]*>[\s\S]*?<\/item>/gi);
      
      if (itemMatches) {
        for (const itemXml of itemMatches.slice(0, 10)) {
          const item = this.parseRSSItem(itemXml);
          if (item.title) {
            items.push(item);
          }
        }
      }
    } catch (error) {
      console.warn('论坛RSS解析失败:', error.message);
    }
    
    return items;
  }

  parseXML(xmlText) {
    const items = [];
    
    // 检测是否为Atom格式
    const isAtom = xmlText.includes('<feed') && xmlText.includes('xmlns="http://www.w3.org/2005/Atom"');
    
    // 根据格式选择合适的匹配模式
    let itemMatches;
    if (isAtom) {
      itemMatches = xmlText.match(/<entry[^>]*>[\s\S]*?<\/entry>/gi);
    } else {
      itemMatches = xmlText.match(/<item[^>]*>[\s\S]*?<\/item>/gi);
    }

    if (!itemMatches) return items;

    for (const itemXml of itemMatches) {
      try {
        const item = isAtom ? this.parseAtomEntry(itemXml) : this.parseRSSItem(itemXml);
        if (item.title && item.guid) {
          items.push(item);
        }
      } catch (error) {
        console.error('解析item失败:', error);
      }
    }

    return items.slice(0, 10); // 限制最多10条
  }

  parseRSSItem(itemXml) {
    const item = {};

    // 提取标题
    const titleMatch = itemXml.match(/<title[^>]*><!\[CDATA\[(.*?)\]\]><\/title>/) ||
                      itemXml.match(/<title[^>]*>(.*?)<\/title>/);
    item.title = titleMatch ? this.decodeHTML(titleMatch[1].trim()) : '';

    // 提取链接
    const linkMatch = itemXml.match(/<link[^>]*>(.*?)<\/link>/);
    item.link = linkMatch ? linkMatch[1].trim() : '';

    // 提取描述
    const descMatch = itemXml.match(/<description[^>]*><!\[CDATA\[(.*?)\]\]><\/description>/) ||
                     itemXml.match(/<description[^>]*>(.*?)<\/description>/) ||
                     itemXml.match(/<content:encoded[^>]*><!\[CDATA\[(.*?)\]\]><\/content:encoded>/);
    
    if (descMatch) {
      item.description = this.stripHTML(this.decodeHTML(descMatch[1])).substring(0, 200);
    }

    // 提取GUID
    const guidMatch = itemXml.match(/<guid[^>]*>(.*?)<\/guid>/);
    item.guid = guidMatch ? guidMatch[1].trim() : item.link || item.title;

    // 提取发布时间
    const pubDateMatch = itemXml.match(/<pubDate[^>]*>(.*?)<\/pubDate>/);
    if (pubDateMatch) {
      try {
        item.publishedAt = new Date(pubDateMatch[1].trim()).toLocaleString('zh-CN');
      } catch (e) {
        item.publishedAt = pubDateMatch[1].trim();
      }
    }

    return item;
  }

  parseAtomEntry(entryXml) {
    const item = {};

    // 提取标题
    const titleMatch = entryXml.match(/<title[^>]*type=["']?html["']?[^>]*><!\[CDATA\[(.*?)\]\]><\/title>/) ||
                      entryXml.match(/<title[^>]*type=["']?html["']?[^>]*>(.*?)<\/title>/) ||
                      entryXml.match(/<title[^>]*><!\[CDATA\[(.*?)\]\]><\/title>/) ||
                      entryXml.match(/<title[^>]*>(.*?)<\/title>/);
    item.title = titleMatch ? this.decodeHTML(titleMatch[1].trim()) : '';

    // 提取链接 - Atom中链接格式为 <link href="..."/>
    const linkMatch = entryXml.match(/<link[^>]+href=["'](.*?)["'][^>]*\/?>/) ||
                     entryXml.match(/<link[^>]+href=["'](.*?)["'][^>]*><\/link>/);
    item.link = linkMatch ? linkMatch[1].trim() : '';

    // 提取内容/摘要
    const contentMatch = entryXml.match(/<content[^>]*type=["']?html["']?[^>]*><!\[CDATA\[(.*?)\]\]><\/content>/) ||
                        entryXml.match(/<content[^>]*type=["']?html["']?[^>]*>(.*?)<\/content>/) ||
                        entryXml.match(/<content[^>]*><!\[CDATA\[(.*?)\]\]><\/content>/) ||
                        entryXml.match(/<content[^>]*>(.*?)<\/content>/) ||
                        entryXml.match(/<summary[^>]*type=["']?html["']?[^>]*><!\[CDATA\[(.*?)\]\]><\/summary>/) ||
                        entryXml.match(/<summary[^>]*type=["']?html["']?[^>]*>(.*?)<\/summary>/) ||
                        entryXml.match(/<summary[^>]*><!\[CDATA\[(.*?)\]\]><\/summary>/) ||
                        entryXml.match(/<summary[^>]*>(.*?)<\/summary>/);
    
    if (contentMatch) {
      item.description = this.stripHTML(this.decodeHTML(contentMatch[1])).substring(0, 200);
    }

    // 提取ID作为GUID
    const idMatch = entryXml.match(/<id[^>]*>(.*?)<\/id>/);
    item.guid = idMatch ? idMatch[1].trim() : item.link || item.title;

    // 提取发布时间 - Atom使用 published 或 updated
    const publishedMatch = entryXml.match(/<published[^>]*>(.*?)<\/published>/) ||
                          entryXml.match(/<updated[^>]*>(.*?)<\/updated>/);
    if (publishedMatch) {
      try {
        item.publishedAt = new Date(publishedMatch[1].trim()).toLocaleString('zh-CN');
      } catch (e) {
        item.publishedAt = publishedMatch[1].trim();
      }
    }

    return item;
  }

  parseItem(itemXml) {
    // 这个方法保留用于向后兼容，但实际使用上面的专门方法
    return this.parseRSSItem(itemXml);
  }

  stripHTML(html) {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }

  decodeHTML(str) {
    const entities = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#39;': "'",
      '&nbsp;': ' '
    };
    
    return str.replace(/&[a-z0-9#]+;/gi, (match) => entities[match] || match);
  }

  // 计算重试延迟时间
  calculateRetryDelay(attempt, url) {
    let baseDelay = 2000; // 基础延迟2秒
    
    // 针对高风险网站增加延迟
    if (url.includes('hostloc.com') || url.includes('linux.do')) {
      baseDelay = 5000; // 5秒基础延迟
    }
    
    // 指数退避 + 随机抖动
    const exponentialDelay = Math.pow(2, attempt) * 1000;
    const jitter = Math.random() * 2000; // 0-2秒随机抖动
    
    return Math.min(baseDelay + exponentialDelay + jitter, 20000); // 最多20秒
  }

  // 检查是否为空的但有效的RSS
  isValidEmptyRSS(xmlText) {
    return xmlText.includes('<rss') || xmlText.includes('<feed') || 
           (xmlText.includes('<?xml') && (xmlText.includes('rss') || xmlText.includes('atom')));
  }
}
