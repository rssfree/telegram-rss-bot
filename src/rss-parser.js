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

    const maxRetries = 3;
    let lastError;
    
    // 只尝试直接访问，移除代理方案
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.fetchWithHeaders(url, attempt);

        if (response.ok) {
          const xmlText = await response.text();
          const items = this.parseXML(xmlText);
          
          if (items.length > 0) {
            // 成功访问，重置失败计数
            this.recordSuccess(url);
            return items;
          }
        } else if (response.status === 429) {
          // 429错误特殊处理
          console.warn(`访问频率限制 ${url}, 设置更长的冷却时间`);
          this.recordRateLimit(url);
          break; // 429错误直接退出，不重试
        } else if (response.status === 403) {
          console.warn(`直接访问被拒绝 ${url}, 尝试次数: ${attempt}`);
          // 403错误继续重试，但使用不同的User-Agent
        } else {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      } catch (error) {
        lastError = error;
        console.warn(`RSS解析尝试 ${attempt}/${maxRetries} 失败 ${url}:`, error.message);
        
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }
    
    // 记录失败
    this.recordFailure(url);
    console.error(`所有尝试都失败了 ${url}: ${lastError?.message || 'Unknown error'}`);
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
    // 根据尝试次数使用不同的请求策略
    const strategies = [
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/rss+xml, application/xml, text/xml, */*',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      },
      {
        headers: {
          'User-Agent': 'Feedbin feed-id:1 - 1 subscribers',
          'Accept': 'application/rss+xml, application/atom+xml, text/xml',
          'Accept-Language': 'en-US,en;q=0.5'
        }
      },
      {
        headers: {
          'User-Agent': 'RSS Bot/1.0 (+https://example.com/bot)',
          'Accept': 'application/xml, text/xml, */*',
          'Accept-Language': 'zh-CN,en;q=0.8'
        }
      }
    ];

    const strategy = strategies[Math.min(attempt - 1, strategies.length - 1)];
    
    // 添加随机延迟防止被识别为机器人
    if (attempt > 1) {
      await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 1000));
    }

    return fetch(url, {
      method: 'GET',
      headers: strategy.headers,
      redirect: 'follow',
      timeout: 15000 // 15秒超时
    });
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
}
