// RSS源诊断工具
// 用于分析RSS源添加失败的具体原因

import { RSSParser } from './rss-parser.js';

export class RSSDiagnostics {
  constructor() {
    this.parser = new RSSParser();
  }

  /**
   * 全面诊断RSS源的可访问性和格式
   * @param {string} url - RSS URL
   * @returns {Object} 详细的诊断结果
   */
  async diagnoseRSSSource(url) {
    const result = {
      url: url,
      timestamp: new Date().toISOString(),
      accessible: false,
      issues: [],
      warnings: [],
      details: {},
      suggestions: []
    };

    // 1. URL格式验证
    if (!this.isValidUrl(url)) {
      result.issues.push('无效的URL格式');
      result.suggestions.push('检查URL是否完整，包含协议(http/https)');
      return result;
    }

    try {
      // 2. 网络连接测试
      const connectionTest = await this.testConnection(url);
      result.details.connection = connectionTest;

      if (!connectionTest.success) {
        result.issues.push(`网络连接失败: ${connectionTest.error}`);
        result.suggestions.push('检查网络连接或RSS源服务器状态');
        return result;
      }

      // 3. HTTP响应分析
      const httpTest = await this.analyzeHttpResponse(url);
      result.details.http = httpTest;

      if (httpTest.status !== 200) {
        result.issues.push(`HTTP错误: ${httpTest.status} - ${httpTest.statusText}`);
        
        if (httpTest.status === 403) {
          result.suggestions.push('服务器拒绝访问，可能需要特殊的User-Agent或认证');
          result.suggestions.push('尝试使用浏览器User-Agent和完整请求头');
          result.suggestions.push('检查网站是否需要登录或有地域限制');
          result.suggestions.push('考虑添加Referer头或其他身份验证信息');
        } else if (httpTest.status === 404) {
          result.suggestions.push('RSS源不存在，检查URL是否正确');
        } else if (httpTest.status === 429) {
          result.suggestions.push('请求频率过高，稍后再试');
        } else if (httpTest.status === 418) {
          result.suggestions.push('检测到反爬虫机制 (HTTP 418 "I\'m a teapot")');
          result.suggestions.push('这是网站的自动化访问检测，需要模拟真实用户行为');
          result.suggestions.push('建议：增加随机延迟、使用真实浏览器请求头、添加Referer');
          result.suggestions.push('可能需要通过浏览器手动访问一次该网站');
        } else if (httpTest.status === 503) {
          result.suggestions.push('服务暂时不可用，稍后重试');
        } else if (httpTest.status >= 500) {
          result.suggestions.push('服务器内部错误，请稍后重试');
        }
        return result;
      }

      // 4. 内容格式分析
      const contentTest = await this.analyzeContent(url);
      result.details.content = contentTest;

      if (!contentTest.isValidXML) {
        result.issues.push('内容不是有效的XML格式');
        result.suggestions.push('检查RSS源是否返回正确的XML内容');
        return result;
      }

      if (!contentTest.isRSSorAtom) {
        result.issues.push('内容不是有效的RSS或Atom格式');
        result.suggestions.push('确认链接指向的是RSS或Atom feed');
        return result;
      }

      // 5. 内容解析测试
      const parseTest = await this.testParsing(url);
      result.details.parsing = parseTest;

      if (parseTest.itemCount === 0) {
        result.warnings.push('RSS源中没有找到任何条目');
        result.suggestions.push('RSS源可能为空或使用了不支持的格式');
      } else {
        result.accessible = true;
        result.details.sampleItem = parseTest.sampleItem;
      }

      // 6. 编码检测
      const encodingTest = await this.analyzeEncoding(url);
      result.details.encoding = encodingTest;

      if (encodingTest.hasEncodingIssues) {
        result.warnings.push('检测到字符编码问题');
        result.suggestions.push('RSS源可能使用了非标准编码');
      }

    } catch (error) {
      result.issues.push(`诊断过程中发生错误: ${error.message}`);
      result.suggestions.push('请检查网络连接和RSS源的可用性');
    }

    return result;
  }

  /**
   * 测试网络连接
   */
  async testConnection(url) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, {
        method: 'HEAD',
        headers: {
          'User-Agent': 'RSS-Bot-Diagnostics/1.0'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      return {
        success: true,
        status: response.status,
        headers: Object.fromEntries(response.headers.entries())
      };
    } catch (error) {
      if (error.name === 'AbortError') {
        return { success: false, error: '连接超时' };
      }
      return { success: false, error: error.message };
    }
  }

  /**
   * 分析HTTP响应
   */
  async analyzeHttpResponse(url) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/rss+xml, application/xml, text/xml, */*'
        }
      });

      return {
        status: response.status,
        statusText: response.statusText,
        contentType: response.headers.get('content-type') || '',
        contentLength: response.headers.get('content-length') || '',
        server: response.headers.get('server') || '',
        lastModified: response.headers.get('last-modified') || '',
        etag: response.headers.get('etag') || '',
        redirected: response.redirected,
        finalUrl: response.url
      };
    } catch (error) {
      return {
        status: 0,
        error: error.message
      };
    }
  }

  /**
   * 分析内容格式
   */
  async analyzeContent(url) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/rss+xml, application/xml, text/xml, */*'
        }
      });

      const text = await response.text();
      const first1000Chars = text.substring(0, 1000);

      return {
        isValidXML: this.isValidXML(text),
        isRSSorAtom: this.isRSSorAtom(text),
        hasItems: this.hasItems(text),
        contentLength: text.length,
        preview: first1000Chars,
        detectedFormat: this.detectFormat(text),
        encoding: this.detectEncoding(text)
      };
    } catch (error) {
      return {
        error: error.message,
        isValidXML: false,
        isRSSorAtom: false
      };
    }
  }

  /**
   * 测试解析结果
   */
  async testParsing(url) {
    try {
      const items = await this.parser.parseRSS(url);
      
      return {
        itemCount: items.length,
        sampleItem: items.length > 0 ? {
          title: items[0].title,
          link: items[0].link,
          hasDescription: !!items[0].description,
          hasGuid: !!items[0].guid,
          hasPublishedAt: !!items[0].publishedAt
        } : null,
        success: items.length > 0
      };
    } catch (error) {
      return {
        itemCount: 0,
        error: error.message,
        success: false
      };
    }
  }

  /**
   * 分析编码问题
   */
  async analyzeEncoding(url) {
    try {
      const response = await fetch(url);
      const text = await response.text();
      
      return {
        hasEncodingIssues: this.detectEncodingIssues(text),
        detectedCharset: this.extractCharset(response.headers.get('content-type') || ''),
        hasBOM: text.charCodeAt(0) === 0xFEFF,
        hasControlChars: /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(text)
      };
    } catch (error) {
      return {
        error: error.message,
        hasEncodingIssues: true
      };
    }
  }

  // 辅助方法
  isValidUrl(url) {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  isValidXML(text) {
    return text.trim().startsWith('<?xml') || text.trim().startsWith('<rss') || 
           text.trim().startsWith('<feed') || text.includes('</rss>') || text.includes('</feed>');
  }

  isRSSorAtom(text) {
    return text.includes('<rss') || text.includes('<feed') || 
           text.includes('xmlns="http://www.w3.org/2005/Atom"');
  }

  hasItems(text) {
    return text.includes('<item') || text.includes('<entry');
  }

  detectFormat(text) {
    if (text.includes('<rss')) return 'RSS';
    if (text.includes('<feed') && text.includes('xmlns="http://www.w3.org/2005/Atom"')) return 'Atom';
    if (text.includes('<feed')) return 'Atom (可能)';
    return '未知';
  }

  detectEncoding(text) {
    const xmlDeclaration = text.match(/<?xml[^>]+encoding=["']([^"']+)["']/i);
    return xmlDeclaration ? xmlDeclaration[1] : 'UTF-8 (默认)';
  }

  detectEncodingIssues(text) {
    // 检测常见的编码问题标志
    return text.includes('�') || // 替换字符
           text.includes('\uFFFD') || // Unicode替换字符
           /[\x80-\x9F]/.test(text); // Windows-1252控制字符
  }

  extractCharset(contentType) {
    const match = contentType.match(/charset=([^;]+)/i);
    return match ? match[1].trim() : '';
  }

  /**
   * 生成诊断报告
   */
  generateReport(result) {
    let report = `📊 RSS源诊断报告\n`;
    report += `🔗 URL: ${result.url}\n`;
    report += `⏰ 检测时间: ${new Date(result.timestamp).toLocaleString('zh-CN')}\n`;
    report += `✅ 可访问: ${result.accessible ? '是' : '否'}\n\n`;

    if (result.issues.length > 0) {
      report += `❌ 发现问题:\n`;
      result.issues.forEach(issue => {
        report += `   • ${issue}\n`;
      });
      report += `\n`;
    }

    if (result.warnings.length > 0) {
      report += `⚠️ 警告:\n`;
      result.warnings.forEach(warning => {
        report += `   • ${warning}\n`;
      });
      report += `\n`;
    }

    if (result.suggestions.length > 0) {
      report += `💡 建议:\n`;
      result.suggestions.forEach(suggestion => {
        report += `   • ${suggestion}\n`;
      });
      report += `\n`;
    }

    // 详细信息
    if (result.details.http) {
      const http = result.details.http;
      report += `📡 HTTP响应详情:\n`;
      report += `   状态: ${http.status} ${http.statusText}\n`;
      if (http.contentType) report += `   内容类型: ${http.contentType}\n`;
      if (http.server) report += `   服务器: ${http.server}\n`;
      if (http.redirected) report += `   重定向到: ${http.finalUrl}\n`;
      report += `\n`;
    }

    if (result.details.content) {
      const content = result.details.content;
      report += `📄 内容分析:\n`;
      report += `   格式: ${content.detectedFormat}\n`;
      report += `   编码: ${content.encoding}\n`;
      report += `   大小: ${content.contentLength} 字符\n`;
      report += `   包含条目: ${content.hasItems ? '是' : '否'}\n`;
      report += `\n`;
    }

    if (result.details.parsing?.success) {
      const parsing = result.details.parsing;
      report += `🔍 解析结果:\n`;
      report += `   找到条目: ${parsing.itemCount} 个\n`;
      if (parsing.sampleItem) {
        report += `   示例标题: ${parsing.sampleItem.title}\n`;
      }
      report += `\n`;
    }

    return report;
  }
}
