import { DBManager } from './db-manager.js';

export class TelegramBot {
  constructor(token, db) {
    this.token = token;
    this.dbManager = new DBManager(db);
    this.apiUrl = `https://api.telegram.org/bot${token}`;
  }

  async handleUpdate(update) {
    try {
      if (update.message) {
        await this.handleMessage(update.message);
      } else if (update.my_chat_member) {
        await this.handleMyChatMember(update.my_chat_member);
      }
      return new Response('OK', { status: 200 });
    } catch (error) {
      console.error('处理更新失败:', error);
      return new Response('Error', { status: 500 });
    }
  }

  async handleMessage(message) {
    const userId = message.from.id.toString();
    const chatType = message.chat?.type || 'private';
    const text = message.text?.trim();

    if (!text || !text.startsWith('/')) return;

    const [command, ...args] = text.split(' ');

    switch (command) {
      case '/start':
        await this.sendMessage(userId, '欢迎使用RSS订阅Bot！\n\n可用命令：\n/add <RSS链接> - 添加订阅\n/list - 查看订阅列表\n/del <编号> - 删除订阅\n/channels - 查看可用推送目标\n/targets - 管理推送目标\n/bind <订阅号> <目标号或列表> - 绑定推送\n/unbind <订阅号> - 解除绑定\n/help - 帮助信息');
        break;
      
      case '/add':
        await this.handleAddCommand(userId, args);
        break;
      
      case '/list':
        await this.handleListCommand(userId);
        break;
      
      case '/del':
        await this.handleDeleteCommand(userId, args);
        break;
      
      case '/proxy':
        await this.handleProxyCommand(userId, args);
        break;
      
      case '/failed':
        await this.handleFailedCommand(userId);
        break;
      
      case '/stats':
        await this.handleStatsCommand(userId);
        break;
      
      case '/status':
        await this.handleStatusCommand(userId);
        break;
      
      case '/pushmode':
        await this.handlePushModeCommand(userId, args);
        break;
      
      case '/channels':
        if (chatType !== 'private') {
          await this.sendMessage(message.chat.id.toString(), '请在与Bot的私聊中使用该命令');
          break;
        }
        await this.handleChannelsCommand(userId);
        break;

      case '/targets':
        if (chatType !== 'private') {
          await this.sendMessage(message.chat.id.toString(), '请在与Bot的私聊中使用该命令');
          break;
        }
        await this.handleTargetsCommand(userId, args);
        break;

      case '/bind':
        if (chatType !== 'private') {
          await this.sendMessage(message.chat.id.toString(), '请在与Bot的私聊中使用该命令');
          break;
        }
        await this.handleBindCommand(userId, args);
        break;

      case '/unbind':
        if (chatType !== 'private') {
          await this.sendMessage(message.chat.id.toString(), '请在与Bot的私聊中使用该命令');
          break;
        }
        await this.handleUnbindCommand(userId, args);
        break;

      case '/help':
        await this.sendMessage(userId, 
          '📖 帮助信息：\n\n' +
          '🔗 /add <RSS链接> - 添加单个RSS订阅\n' +
          '🔗 /add <链接1> <链接2> ... - 添加多个RSS订阅\n' +
          '📝 /list - 查看所有订阅\n' +
          '🗑 /del <编号> - 删除单个订阅\n' +
          '🗑 /del <编号1> <编号2> ... - 删除多个订阅\n' +
          '📢 /channels - 查看可推送的频道/群组\n' +
          '🎯 /targets - 管理推送目标（激活/停用/删除）\n' +
          '🔗 /bind <订阅号> <目标号,目标号> - 绑定订阅\n' +
          '❌ /unbind <订阅号> - 解除绑定\n' +
          '🔧 /proxy <RSS链接> - 测试RSS源访问情况\n' +
          '⚠️ /failed - 查看失败的RSS订阅\n' +
          '📊 /stats - 查看统计信息\n' +
          '📈 /status - 查看RSS源状态报告\n' +
          '📱 /pushmode - 设置推送模式\n' +
          '❓ /help - 显示帮助信息'
        );
        break;
      
      default:
        await this.sendMessage(userId, '未知命令，输入 /help 查看帮助');
    }
  }

  async handleMyChatMember(myChatMember) {
    try {
      const actorUserId = myChatMember.from?.id?.toString();
      const chat = myChatMember.chat;
      const newStatus = myChatMember.new_chat_member?.status;

      if (!actorUserId || !chat || !newStatus) return;

      const chatType = chat.type; // 'group' | 'supergroup' | 'channel' | 'private'
      if (!['group', 'supergroup', 'channel'].includes(chatType)) return;

      // Register on join or promotion to administrator/member
      if (['administrator', 'member', 'creator'].includes(newStatus)) {
        const chatId = chat.id.toString();
        const title = chat.title || '';
        const username = chat.username || '';
        await this.dbManager.upsertPushTarget({
          ownerUserId: actorUserId,
          chatId,
          chatType,
          title,
          username
        });

        // Try to send a confirmation message to the target chat
        const typeLabel = chatType === 'channel' ? '频道' : (chatType === 'supergroup' ? '超级群组' : '群组');
        const confirm = `✅ 已注册推送目标：${title || username || chatId}\n📋 类型：${typeLabel}\n🆔 ID：${chatId}\n\n现在可在私聊使用 /channels 查看并 /bind 绑定订阅。`;
        try {
          await this.sendMessage(chatId, confirm);
        } catch (_) {
          // ignore errors (e.g., no permission in channel)
        }

        // Notify the owner in private chat
        await this.sendMessage(actorUserId, `📢 收到新推送目标\n${confirm}`);
      }
    } catch (e) {
      console.error('处理my_chat_member失败:', e);
    }
  }

  async handleAddCommand(userId, args) {
    if (args.length === 0) {
      await this.sendMessage(userId, '请提供RSS链接，例如：/add https://example.com/rss.xml');
      return;
    }

    let addedCount = 0;
    let duplicateCount = 0;
    let errorCount = 0;
    const results = [];

    for (const url of args) {
      try {
        if (!this.isValidUrl(url)) {
          results.push(`❌ 无效链接：${url}`);
          errorCount++;
          continue;
        }

        // 先测试RSS源是否可访问
        const testResult = await this.testRSSSource(url);
        if (!testResult.accessible) {
          results.push(`⚠️ 无法访问：${url}\n   错误：${testResult.error}`);
          errorCount++;
          continue;
        }

        const siteName = testResult.siteName || await this.extractSiteName(url);
        const added = await this.dbManager.addSubscription(userId, url, siteName);
        
        if (added) {
          results.push(`✅ 已添加：${siteName}`);
          addedCount++;
        } else {
          results.push(`⚠️ 已订阅：${siteName}`);
          duplicateCount++;
        }
      } catch (error) {
        results.push(`❌ 添加失败：${url}`);
        errorCount++;
      }
    }

    let summary = `📊 操作结果：\n✅ 新增：${addedCount}个\n⚠️ 重复：${duplicateCount}个\n❌ 失败：${errorCount}个\n\n`;
    const message = summary + results.join('\n');
    
    await this.sendMessage(userId, message);
  }

  // 测试RSS源可访问性
  async testRSSSource(url) {
    const rssParser = new (await import('./rss-parser.js')).RSSParser();
    
    try {
      // 尝试获取第一条内容以验证
      const items = await rssParser.parseRSS(url);
      
      if (items.length > 0) {
        return { 
          accessible: true, 
          siteName: await this.extractSiteName(url)
        };
      } else {
        return { 
          accessible: false, 
          error: 'RSS源无内容或格式错误' 
        };
      }
    } catch (error) {
      return { 
        accessible: false, 
        error: error.message 
      };
    }
  }

  async handleProxyCommand(userId, args) {
    if (args.length === 0) {
      await this.sendMessage(userId, 
        '🔧 代理测试命令：\n\n' +
        '📝 用法：/proxy <RSS链接>\n' +
        '🎯 功能：测试RSS源访问情况\n' +
        '📊 显示：直连状态、代理结果、内容预览\n\n' +
        '💡 示例：/proxy https://linux.do/latest.rss'
      );
      return;
    }

    const url = args[0];
    if (!this.isValidUrl(url)) {
      await this.sendMessage(userId, '❌ 无效的URL格式');
      return;
    }

    await this.sendMessage(userId, '🔍 正在测试RSS源访问情况，请稍候...');

    const rssParser = new (await import('./rss-parser.js')).RSSParser();
    
    try {
      // 测试直接访问
      let directResult = '❌ 直接访问失败';
      let contentPreview = '';

      try {
        const directResponse = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/xml, text/xml'
          },
          timeout: 10000
        });
        
        if (directResponse.ok) {
          directResult = '✅ 直接访问成功';
          const xmlText = await directResponse.text();
          const items = rssParser.parseXML(xmlText);
          if (items.length > 0) {
            contentPreview = `📄 内容预览：${items[0].title}`;
          }
        } else {
          directResult = `❌ 直接访问失败 (HTTP ${directResponse.status})`;
        }
      } catch (error) {
        directResult = `❌ 直接访问失败 (${error.message})`;
      }

      // 移除代理测试，只保留直接访问测试

      const siteName = await this.extractSiteName(url);
      
      const message = 
        `🔍 RSS源测试结果：\n\n` +
        `🌐 网站：${siteName}\n` +
        `🔗 链接：${url}\n\n` +
        `📡 ${directResult}\n\n` +
        `${contentPreview}\n\n` +
        `💡 ${directResult.includes('成功') ? 
          '该RSS源可以正常使用' : 
          '该RSS源暂时无法访问，建议检查链接或稍后再试'
        }`;
      
      await this.sendMessage(userId, message);
    } catch (error) {
      await this.sendMessage(userId, `❌ 测试过程中发生错误：${error.message}`);
    }
  }

  async handleFailedCommand(userId) {
    try {
      const userSubscriptions = await this.dbManager.getUserSubscriptions(userId);
      const failedSubs = await this.dbManager.getFailedSubscriptions();
      
      // 过滤出用户的失败订阅
      const userFailed = failedSubs.filter(failed => 
        userSubscriptions.some(sub => sub.rss_url === failed.rss_url)
      );
      
      if (userFailed.length === 0) {
        await this.sendMessage(userId, '✅ 您的所有RSS订阅都工作正常！');
        return;
      }
      
      let message = `⚠️ 失败的RSS订阅 (${userFailed.length}个)：\n\n`;
      
      userFailed.forEach((failed, index) => {
        const errorMsg = failed.error_message || '未知错误';
        const shortError = errorMsg.length > 50 ? errorMsg.substring(0, 50) + '...' : errorMsg;
        message += `${index + 1}. ${failed.site_name || '未知网站'}\n`;
        message += `🔗 ${failed.rss_url}\n`;
        message += `❌ ${shortError}\n`;
        message += `🔄 失败次数: ${failed.failure_count}\n`;
        message += `⏰ 最后失败: ${new Date(failed.last_failure).toLocaleString('zh-CN')}\n\n`;
      });
      
      message += '💡 建议：检查RSS源是否可访问，或考虑删除失效的订阅';
      
      await this.sendMessage(userId, message);
    } catch (error) {
      console.error('获取失败订阅失败:', error);
      await this.sendMessage(userId, '获取失败信息时出错，请稍后再试');
    }
  }

  async handleStatsCommand(userId) {
    try {
      const userStats = await this.dbManager.getUserSubscriptions(userId);
      const globalStats = await this.dbManager.getStats();
      
      const message = 
        `📊 统计信息：\n\n` +
        `👤 您的订阅：${userStats.length} 个\n` +
        `🌐 全局统计：\n` +
        `  └ 总用户：${globalStats.users} 人\n` +
        `  └ 总订阅：${globalStats.subscriptions} 个\n` +
        `  └ 文章记录：${globalStats.items} 条\n\n` +
        `🔄 检查频率：每10分钟\n` +
        `💾 记录保留：30天`;
      
      await this.sendMessage(userId, message);
    } catch (error) {
      console.error('获取统计信息失败:', error);
      await this.sendMessage(userId, '获取统计信息失败，请稍后再试');
    }
  }

  async handleListCommand(userId) {
    const subscriptions = await this.dbManager.getUserSubscriptions(userId);
    
    if (subscriptions.length === 0) {
      await this.sendMessage(userId, '您还没有任何订阅，使用 /add 添加RSS源');
      return;
    }

    let message = `📚 您的订阅列表（${subscriptions.length}个）：\n\n`;
    // For each subscription, show binding count
    for (let i = 0; i < subscriptions.length; i++) {
      const sub = subscriptions[i];
      const boundChats = await this.dbManager.listBindingsForSubscription(userId, sub.rss_url);
      message += `${i + 1}. ${sub.site_name}\n🔗 ${sub.rss_url}\n`;
      message += `📌 绑定：${boundChats.length} 个目标\n\n`;
    }
    
    message += '💡 使用 /del <编号> 删除订阅\n💡 使用 /bind <订阅号> <目标号,目标号> 进行绑定';
    await this.sendMessage(userId, message);
  }

  async handleDeleteCommand(userId, args) {
    if (args.length === 0) {
      await this.sendMessage(userId, '请指定要删除的订阅编号，例如：/del 1 或 /del 1 3 5');
      return;
    }

    const subscriptions = await this.dbManager.getUserSubscriptions(userId);
    if (subscriptions.length === 0) {
      await this.sendMessage(userId, '您没有任何订阅');
      return;
    }

    let deletedCount = 0;
    let errorCount = 0;
    const results = [];
    const toDelete = []; // 先收集要删除的项目

    // 验证所有编号并收集要删除的订阅
    for (const arg of args) {
      const index = parseInt(arg) - 1;
      
      if (isNaN(index) || index < 0 || index >= subscriptions.length) {
        results.push(`❌ 无效编号：${arg}`);
        errorCount++;
        continue;
      }

      const subscription = subscriptions[index];
      if (!toDelete.find(item => item.rss_url === subscription.rss_url)) {
        toDelete.push(subscription);
      }
    }

    // 执行删除操作
    for (const subscription of toDelete) {
      try {
        const deleted = await this.dbManager.deleteSubscription(userId, subscription.rss_url);
        
        if (deleted) {
          results.push(`✅ 已删除：${subscription.site_name}`);
          deletedCount++;
        } else {
          // 检查是否真的存在于数据库中
          const stillExists = await this.dbManager.checkSubscriptionExists(userId, subscription.rss_url);
          if (!stillExists) {
            results.push(`✅ 已删除：${subscription.site_name}`);
            deletedCount++;
          } else {
            results.push(`❌ 删除失败：${subscription.site_name}`);
            errorCount++;
          }
        }
      } catch (error) {
        console.error('删除订阅失败:', error);
        results.push(`❌ 删除失败：${subscription.site_name}`);
        errorCount++;
      }
    }

    let summary = `📊 删除结果：\n✅ 成功：${deletedCount}个\n❌ 失败：${errorCount}个\n\n`;
    const message = summary + results.join('\n');
    
    await this.sendMessage(userId, message);
  }

  async sendRSSItem(userId, item, siteName) {
    const title = this.escapeMarkdown(item.title);
    const link = item.link || '';
    const description = this.escapeMarkdown(item.description || '');
    const publishedAt = item.publishedAt || '未知时间';
    
    // 格式化消息：第一行标题+链接，第二行来源+时间
    let message = `🔗 [${title}](${link})\n`;
    if (description) {
      message += `📝 ${description.substring(0, 200)}${description.length > 200 ? '...' : ''}\n`;
    }
    message += `📰 来源：${siteName} | ⏰ ${publishedAt}`;

    await this.sendMessage(userId, message, true);
  }

   // 智能推送RSS内容，支持多种推送模式
  async sendRSSUpdate(ownerUserId, rssUrl, item, siteName) {
    // 获取用户推送模式
    const pushMode = await this.dbManager.getUserPushMode(ownerUserId) || 'smart';
    
    // 获取绑定的目标
    const chatIds = await this.dbManager.listBindingsForSubscription(ownerUserId, rssUrl);
    
    console.log(`用户 ${ownerUserId} 推送模式: ${pushMode}, 绑定目标: ${chatIds.length}个`);
    
    let sentToPrivate = false;
    let sentToTargets = 0;
    
    // 根据推送模式决定推送策略
    switch (pushMode) {
      case 'smart':
        // 智能模式：有绑定目标时只推送到目标，无绑定时推送到私聊
        if (chatIds.length === 0) {
          await this.sendRSSItem(ownerUserId, item, siteName);
          sentToPrivate = true;
          console.log(`智能模式：无绑定目标，推送到私聊`);
        } else {
          // 推送到绑定的目标
          for (const chatId of chatIds) {
            try {
              const already = await this.dbManager.hasPushedToChat(rssUrl, item.guid, chatId);
              if (already) {
                console.log(`跳过已推送的内容到 ${chatId}`);
                continue;
              }
              
              await this.sendRSSItem(chatId, item, siteName);
              await this.dbManager.savePushRecord(rssUrl, item.guid, chatId);
              sentToTargets++;
              
              // 增加延迟，避免Telegram API速率限制
              await new Promise(r => setTimeout(r, 200));
            } catch (e) {
              console.warn('推送到目标失败', chatId, e.message);
            }
          }
          console.log(`智能模式：推送到 ${sentToTargets} 个绑定目标，跳过私聊`);
        }
        break;
        
      case 'both':
        // 双重推送：同时推送到私聊和绑定的目标
        await this.sendRSSItem(ownerUserId, item, siteName);
        sentToPrivate = true;
        
        for (const chatId of chatIds) {
          try {
            const already = await this.dbManager.hasPushedToChat(rssUrl, item.guid, chatId);
            if (already) {
              console.log(`跳过已推送的内容到 ${chatId}`);
              continue;
            }
            
            await this.sendRSSItem(chatId, item, siteName);
            await this.dbManager.savePushRecord(rssUrl, item.guid, chatId);
            sentToTargets++;
            
            // 增加延迟，避免Telegram API速率限制
            await new Promise(r => setTimeout(r, 200));
          } catch (e) {
            console.warn('推送到目标失败', chatId, e.message);
          }
        }
        console.log(`双重推送：推送到私聊和 ${sentToTargets} 个绑定目标`);
        break;
        
      case 'private':
        // 仅私聊：只推送到私聊，不推送到绑定的目标
        await this.sendRSSItem(ownerUserId, item, siteName);
        sentToPrivate = true;
        console.log(`仅私聊模式：推送到私聊，跳过 ${chatIds.length} 个绑定目标`);
        break;
        
      case 'targets':
        // 仅目标：只推送到绑定的目标，不推送到私聊
        for (const chatId of chatIds) {
          try {
            const already = await this.dbManager.hasPushedToChat(rssUrl, item.guid, chatId);
            if (already) {
              console.log(`跳过已推送的内容到 ${chatId}`);
              continue;
            }
            
            await this.sendRSSItem(chatId, item, siteName);
            await this.dbManager.savePushRecord(rssUrl, item.guid, chatId);
            sentToTargets++;
            
            // 增加延迟，避免Telegram API速率限制
            await new Promise(r => setTimeout(r, 200));
          } catch (e) {
            console.warn('推送到目标失败', chatId, e.message);
          }
        }
        console.log(`仅目标模式：推送到 ${sentToTargets} 个绑定目标，跳过私聊`);
        break;
    }
    
    // 记录推送统计
    console.log(`推送完成：私聊${sentToPrivate ? '✅' : '❌'}, 目标${sentToTargets}个`);
  }

  async sendMessage(userId, text, parseMode = false) {
    const payload = {
      chat_id: userId,
      text: text,
      disable_web_page_preview: false
    };
    
    if (parseMode) {
      payload.parse_mode = 'Markdown';
    }

    const response = await fetch(`${this.apiUrl}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('发送消息失败:', error);
    }
  }

  isValidUrl(string) {
    try {
      new URL(string);
      return true;
    } catch (_) {
      return false;
    }
  }

  async extractSiteName(url) {
    try {
      const domain = new URL(url).hostname;
      return domain.replace('www.', '');
    } catch (error) {
      return 'Unknown Site';
    }
  }

  escapeMarkdown(text) {
    if (!text) return '';
    
    // 使用更智能的转义策略，减少不必要的转义
    // 只转义真正需要转义的字符，避免过度转义
    return text
      // 转义Markdown语法字符，但保留常见的标点符号
      .replace(/([_*[\]()~`>#+=|{}])/g, '\\$1')
      // 不转义句号、感叹号、连字符等常见标点，除非它们在特殊位置
      .replace(/^\./g, '\\.') // 只在开头转义句号
      .replace(/^!/g, '\\!')  // 只在开头转义感叹号
      .replace(/^-/g, '\\-')  // 只在开头转义连字符
      // 处理可能的Markdown链接格式，避免误转义
      .replace(/([^\\])\[/g, '$1\\[')
      .replace(/([^\\])\]/g, '$1\\]')
      .replace(/([^\\])\(/g, '$1\\(')
      .replace(/([^\\])\)/g, '$1\\)');
  }
}

// ===== Targets & Binding Commands =====
TelegramBot.prototype.handleChannelsCommand = async function (userId) {
  const targets = await this.dbManager.listPushTargets(userId);
  if (targets.length === 0) {
    await this.sendMessage(userId, '尚未注册任何推送目标。\n将Bot添加到群组/频道后会自动注册。');
    return;
  }

  let msg = `📢 推送目标列表 (${targets.length}个)：\n\n`;
  targets.forEach((t, idx) => {
    const typeLabel = t.chat_type === 'channel' ? '频道' : (t.chat_type === 'supergroup' ? '超级群组' : '群组');
    const name = t.title || (t.username ? `@${t.username}` : t.chat_id);
    const statusEmoji = t.status === 'active' ? '🟢' : '🔴';
    msg += `${idx + 1}. ${statusEmoji} ${name}\n📋 类型：${typeLabel}\n🆔 ID：${t.chat_id}\n\n`;
  });
  msg += '💡 可使用 /bind <订阅号> <目标号,目标号> 进行绑定';
  await this.sendMessage(userId, msg);
};

TelegramBot.prototype.handleTargetsCommand = async function (userId, args) {
  const targets = await this.dbManager.listPushTargets(userId);
  if (targets.length === 0) {
    await this.sendMessage(userId, '没有可管理的推送目标');
    return;
  }

  if (args.length === 0) {
    let msg = '🎯 推送目标管理：\n\n';
    targets.forEach((t, idx) => {
      const name = t.title || (t.username ? `@${t.username}` : t.chat_id);
      const statusEmoji = t.status === 'active' ? '🟢 active' : '🔴 inactive';
      msg += `${idx + 1}. ${name} (${statusEmoji})\n`;
    });
    msg += '\n指令：\n/targets activate <编号>\n/targets deactivate <编号>\n/targets delete <编号>';
    await this.sendMessage(userId, msg);
    return;
  }

  const action = args[0];
  const indexStr = args[1];
  const idx = parseInt(indexStr, 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= targets.length) {
    await this.sendMessage(userId, '无效编号');
    return;
  }
  const target = targets[idx];
  if (action === 'activate' || action === 'deactivate') {
    const status = action === 'activate' ? 'active' : 'inactive';
    const ok = await this.dbManager.setPushTargetStatus(userId, target.chat_id, status);
    await this.sendMessage(userId, ok ? '已更新状态' : '更新失败');
  } else if (action === 'delete') {
    const ok = await this.dbManager.deletePushTarget(userId, target.chat_id);
    // 兼容已实际删除但返回变更计数不可靠的情况，复查列表
    const refreshed = await this.dbManager.listPushTargets(userId);
    const stillExists = refreshed.some(t => t.chat_id === target.chat_id);
    const success = ok || !stillExists;
    await this.sendMessage(userId, success ? '已删除目标及相关绑定' : '删除失败');
  } else {
    await this.sendMessage(userId, '未知操作，仅支持 activate/deactivate/delete');
  }
};

TelegramBot.prototype.handleBindCommand = async function (userId, args) {
  if (args.length < 2) {
    await this.sendMessage(userId, '用法：/bind <订阅号或范围> <目标号,目标号>\n示例：/bind 1,2,3 2  或  /bind 1-3 2');
    return;
  }

  const subs = await this.dbManager.getUserSubscriptions(userId);
  const targets = await this.dbManager.listPushTargets(userId);
  if (subs.length === 0 || targets.length === 0) {
    await this.sendMessage(userId, '请先添加订阅并将Bot加入群组/频道');
    return;
  }

  // Parse subscriptions: support single index, comma list, or range like 1-3
  const subToken = args[0];
  const subIndices = new Set();
  subToken.split(/[，,]+/).forEach(part => {
    if (!part) return;
    if (/^\d+-\d+$/.test(part)) {
      const [a, b] = part.split('-').map(n => parseInt(n, 10));
      if (!isNaN(a) && !isNaN(b)) {
        const start = Math.min(a, b);
        const end = Math.max(a, b);
        for (let i = start; i <= end; i++) subIndices.add(i - 1);
      }
    } else {
      const idx = parseInt(part, 10) - 1;
      if (!isNaN(idx)) subIndices.add(idx);
    }
  });

  const validSubIndices = Array.from(subIndices).filter(i => i >= 0 && i < subs.length);
  if (validSubIndices.length === 0) {
    await this.sendMessage(userId, '没有有效的订阅编号');
    return;
  }

  // Parse target indices (one or many)
  const targetArg = args.slice(1).join(' ');
  const tokens = targetArg.split(/[，,\s]+/).filter(Boolean);
  const chatIds = [];
  const targetNames = [];
  for (const tok of tokens) {
    const idx = parseInt(tok, 10) - 1;
    if (!isNaN(idx) && idx >= 0 && idx < targets.length) {
      chatIds.push(targets[idx].chat_id);
      targetNames.push(targets[idx].title || targets[idx].username || targets[idx].chat_id);
    }
  }
  if (chatIds.length === 0) {
    await this.sendMessage(userId, '没有有效的目标编号');
    return;
  }

  let totalAdded = 0;
  const subNames = [];
  for (const i of validSubIndices) {
    const sub = subs[i];
    subNames.push(sub.site_name);
    totalAdded += await this.dbManager.bindSubscriptionTargets(userId, sub.rss_url, chatIds);
  }

  const summary = `已绑定：订阅(${subNames.join(', ')}) -> 目标(${targetNames.join(', ')})\n新增绑定：${totalAdded} 个`;
  await this.sendMessage(userId, summary);
};

TelegramBot.prototype.handleUnbindCommand = async function (userId, args) {
  if (args.length < 1) {
    await this.sendMessage(userId, '用法：/unbind <订阅号>');
    return;
  }
  const subs = await this.dbManager.getUserSubscriptions(userId);
  const subIndex = parseInt(args[0], 10) - 1;
  if (isNaN(subIndex) || subIndex < 0 || subIndex >= subs.length) {
    await this.sendMessage(userId, '无效订阅编号');
    return;
  }
  const rssUrl = subs[subIndex].rss_url;
  const removed = await this.dbManager.unbindSubscription(userId, rssUrl);
  await this.sendMessage(userId, removed > 0 ? '已解除该订阅的所有绑定' : '该订阅没有任何绑定');
};

// 添加状态查看命令
TelegramBot.prototype.handleStatusCommand = async function (userId) {
  try {
    const userSubscriptions = await this.dbManager.getUserSubscriptions(userId);
    if (userSubscriptions.length === 0) {
      await this.sendMessage(userId, '您还没有任何订阅，使用 /add 添加RSS源');
      return;
    }

    // 动态导入RSSParser以获取访问统计
    const { RSSParser } = await import('./rss-parser.js');
    const rssParser = new RSSParser();
    
    let message = `📊 RSS源状态报告 (${userSubscriptions.length}个)：\n\n`;
    
    for (let i = 0; i < userSubscriptions.length; i++) {
      const sub = userSubscriptions[i];
      const stats = rssParser.getAccessStats(sub.rss_url);
      
      let status = '🟢 正常';
      let details = '';
      
      if (stats.rateLimitCount > 0) {
        status = '🔴 频率限制';
        const lastAccess = new Date(stats.lastAccess);
        const now = new Date();
        const timeDiff = Math.floor((now - lastAccess) / 1000 / 60); // 分钟
        details = `限流${stats.rateLimitCount}次，${timeDiff}分钟前访问`;
      } else if (stats.failureCount > 0) {
        status = '🟡 部分失败';
        details = `失败${stats.failureCount}次，成功${stats.successCount}次`;
      } else if (stats.successCount > 0) {
        details = `成功${stats.successCount}次`;
      }
      
      message += `${i + 1}. ${sub.site_name}\n`;
      message += `   ${status}\n`;
      if (details) {
        message += `   📝 ${details}\n`;
      }
      message += `   🔗 ${sub.rss_url}\n\n`;
    }
    
    message += '💡 使用 /status 查看最新状态\n';
    message += '💡 频率限制的源会自动跳过，无需手动处理';
    
    await this.sendMessage(userId, message);
  } catch (error) {
    console.error('获取状态信息失败:', error);
    await this.sendMessage(userId, '获取状态信息失败，请稍后再试');
  }
};

// 添加推送模式设置命令
TelegramBot.prototype.handlePushModeCommand = async function (userId, args) {
  try {
    if (args.length === 0) {
      // 显示当前推送模式
      const currentMode = await this.dbManager.getUserPushMode(userId) || 'smart';
      let modeDescription = '';
      
      switch (currentMode) {
        case 'smart':
          modeDescription = '智能模式：有绑定目标时只推送到目标，无绑定时推送到私聊';
          break;
        case 'both':
          modeDescription = '双重推送：同时推送到私聊和绑定的目标';
          break;
        case 'private':
          modeDescription = '仅私聊：只推送到私聊，不推送到绑定的目标';
          break;
        case 'targets':
          modeDescription = '仅目标：只推送到绑定的目标，不推送到私聊';
          break;
        default:
          modeDescription = '智能模式：有绑定目标时只推送到目标，无绑定时推送到私聊';
      }
      
      const message = 
        `📱 当前推送模式：${currentMode.toUpperCase()}\n\n` +
        `📝 ${modeDescription}\n\n` +
        `🔄 可用模式：\n` +
        `• smart - 智能模式（推荐）\n` +
        `• both - 双重推送\n` +
        `• private - 仅私聊\n` +
        `• targets - 仅目标\n\n` +
        `💡 用法：/pushmode <模式>\n` +
        `💡 示例：/pushmode smart`;
      
      await this.sendMessage(userId, message);
      return;
    }
    
    const mode = args[0].toLowerCase();
    const validModes = ['smart', 'both', 'private', 'targets'];
    
    if (!validModes.includes(mode)) {
      await this.sendMessage(userId, 
        `❌ 无效的推送模式：${mode}\n\n` +
        `✅ 可用模式：${validModes.join(', ')}`
      );
      return;
    }
    
    // 保存用户推送模式
    await this.dbManager.setUserPushMode(userId, mode);
    
    let modeDescription = '';
    switch (mode) {
      case 'smart':
        modeDescription = '智能模式：有绑定目标时只推送到目标，无绑定时推送到私聊';
        break;
      case 'both':
        modeDescription = '双重推送：同时推送到私聊和绑定的目标';
        break;
      case 'private':
        modeDescription = '仅私聊：只推送到私聊，不推送到绑定的目标';
        break;
      case 'targets':
        modeDescription = '仅目标：只推送到绑定的目标，不推送到私聊';
        break;
    }
    
    await this.sendMessage(userId, 
      `✅ 推送模式已更新为：${mode.toUpperCase()}\n\n` +
      `📝 ${modeDescription}\n\n` +
      `💡 新设置将在下次RSS更新时生效`
    );
    
  } catch (error) {
    console.error('设置推送模式失败:', error);
    await this.sendMessage(userId, '设置推送模式失败，请稍后再试');
  }
};
