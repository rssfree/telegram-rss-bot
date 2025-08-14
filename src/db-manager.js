export class DBManager {
  constructor(db) {
    this.db = db;
  }

  async ensureSchema() {
    // Create new tables if they do not exist (idempotent)
    const stmts = [
      `CREATE TABLE IF NOT EXISTS push_targets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_user_id TEXT NOT NULL,
        chat_id TEXT NOT NULL,
        chat_type TEXT NOT NULL,
        title TEXT,
        username TEXT,
        status TEXT DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(owner_user_id, chat_id)
      )`,
      `CREATE TABLE IF NOT EXISTS subscription_targets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_user_id TEXT NOT NULL,
        rss_url TEXT NOT NULL,
        chat_id TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(owner_user_id, rss_url, chat_id)
      )`,
      `CREATE TABLE IF NOT EXISTS push_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rss_url TEXT NOT NULL,
        item_guid TEXT NOT NULL,
        chat_id TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(rss_url, item_guid, chat_id)
      )`,
      `CREATE TABLE IF NOT EXISTS user_push_modes (
        user_id TEXT PRIMARY KEY,
        push_mode TEXT DEFAULT 'smart',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    ];
    for (const sql of stmts) {
      await this.db.prepare(sql).run();
    }
  }

  async addSubscription(userId, rssUrl, siteName) {
    try {
      await this.db.prepare(
        'INSERT INTO subscriptions (user_id, rss_url, site_name) VALUES (?, ?, ?)'
      ).bind(userId, rssUrl, siteName).run();
      return true;
    } catch (error) {
      if (error.message.includes('UNIQUE constraint failed')) {
        return false; // 已存在
      }
      throw error;
    }
  }

  // ========== Push Targets ==========
  async upsertPushTarget({ ownerUserId, chatId, chatType, title, username }) {
    // Insert or update basic info; keep status as is if existing
    const existing = await this.db.prepare(
      'SELECT id, status FROM push_targets WHERE owner_user_id = ? AND chat_id = ?'
    ).bind(ownerUserId, chatId).first();

    if (existing) {
      await this.db.prepare(
        'UPDATE push_targets SET chat_type = ?, title = ?, username = ? WHERE owner_user_id = ? AND chat_id = ?'
      ).bind(chatType, title || null, username || null, ownerUserId, chatId).run();
      return { id: existing.id, status: existing.status };
    }

    const result = await this.db.prepare(
      'INSERT INTO push_targets (owner_user_id, chat_id, chat_type, title, username, status) VALUES (?, ?, ?, ?, ?, ? )'
    ).bind(ownerUserId, chatId, chatType, title || null, username || null, 'active').run();
    return { id: result.lastRowId, status: 'active' };
  }

  async listPushTargets(ownerUserId) {
    const result = await this.db.prepare(
      'SELECT id, owner_user_id, chat_id, chat_type, title, username, status, created_at FROM push_targets WHERE owner_user_id = ? ORDER BY created_at DESC'
    ).bind(ownerUserId).all();
    return result.results || [];
  }

  async setPushTargetStatus(ownerUserId, chatId, status) {
    const result = await this.db.prepare(
      'UPDATE push_targets SET status = ? WHERE owner_user_id = ? AND chat_id = ?'
    ).bind(status, ownerUserId, chatId).run();
    return result.changes > 0;
  }

  async deletePushTarget(ownerUserId, chatId) {
    // Also cascade delete bindings for this owner+chat
    await this.db.prepare('DELETE FROM subscription_targets WHERE owner_user_id = ? AND chat_id = ?')
      .bind(ownerUserId, chatId).run();
    const result = await this.db.prepare('DELETE FROM push_targets WHERE owner_user_id = ? AND chat_id = ?')
      .bind(ownerUserId, chatId).run();
    return result.changes > 0;
  }

  // ========== Subscription Bindings ==========
  async listBindings(ownerUserId) {
    const result = await this.db.prepare(
      'SELECT owner_user_id, rss_url, chat_id, created_at FROM subscription_targets WHERE owner_user_id = ? ORDER BY created_at DESC'
    ).bind(ownerUserId).all();
    return result.results || [];
  }

  async listBindingsForSubscription(ownerUserId, rssUrl) {
    const result = await this.db.prepare(
      `SELECT st.chat_id
       FROM subscription_targets st
       LEFT JOIN push_targets pt ON pt.owner_user_id = st.owner_user_id AND pt.chat_id = st.chat_id
       WHERE st.owner_user_id = ? AND st.rss_url = ? AND (pt.status = 'active' OR pt.status IS NULL)`
    ).bind(ownerUserId, rssUrl).all();
    return (result.results || []).map(r => r.chat_id);
  }

  async bindSubscriptionTargets(ownerUserId, rssUrl, chatIds) {
    let added = 0;
    for (const chatId of chatIds) {
      try {
        await this.db.prepare(
          'INSERT INTO subscription_targets (owner_user_id, rss_url, chat_id) VALUES (?, ?, ?)'
        ).bind(ownerUserId, rssUrl, chatId).run();
        added++;
      } catch (e) {
        // ignore unique constraint
        if (!e.message.includes('UNIQUE')) throw e;
      }
    }
    return added;
  }

  async unbindSubscription(ownerUserId, rssUrl) {
    const result = await this.db.prepare(
      'DELETE FROM subscription_targets WHERE owner_user_id = ? AND rss_url = ?'
    ).bind(ownerUserId, rssUrl).run();
    return result.changes;
  }

  // ========== Push Records for de-duplication ==========
  async hasPushedToChat(rssUrl, itemGuid, chatId) {
    const result = await this.db.prepare(
      'SELECT id FROM push_records WHERE rss_url = ? AND item_guid = ? AND chat_id = ?'
    ).bind(rssUrl, itemGuid, chatId).first();
    return !!result;
  }

  async savePushRecord(rssUrl, itemGuid, chatId) {
    try {
      await this.db.prepare(
        'INSERT INTO push_records (rss_url, item_guid, chat_id) VALUES (?, ?, ?)'
      ).bind(rssUrl, itemGuid, chatId).run();
      return true;
    } catch (e) {
      if (e.message.includes('UNIQUE')) return false;
      throw e;
    }
  }

  // 添加失败记录跟踪
  async recordFailure(rssUrl, errorMessage) {
    try {
      await this.db.prepare(`
        INSERT OR REPLACE INTO rss_failures 
        (rss_url, error_message, failure_count, last_failure, created_at) 
        VALUES (
          ?, ?, 
          COALESCE((SELECT failure_count FROM rss_failures WHERE rss_url = ?), 0) + 1,
          CURRENT_TIMESTAMP,
          COALESCE((SELECT created_at FROM rss_failures WHERE rss_url = ?), CURRENT_TIMESTAMP)
        )
      `).bind(rssUrl, errorMessage, rssUrl, rssUrl).run();
    } catch (error) {
      console.error('记录失败信息失败:', error);
    }
  }

  async getFailedSubscriptions() {
    try {
      const result = await this.db.prepare(`
        SELECT f.*, s.site_name, s.user_id
        FROM rss_failures f
        LEFT JOIN subscriptions s ON f.rss_url = s.rss_url
        WHERE f.failure_count >= 3
        ORDER BY f.last_failure DESC
      `).all();
      return result.results || [];
    } catch (error) {
      console.error('获取失败订阅失败:', error);
      return [];
    }
  }

  async clearFailureRecord(rssUrl) {
    try {
      await this.db.prepare('DELETE FROM rss_failures WHERE rss_url = ?').bind(rssUrl).run();
    } catch (error) {
      console.error('清除失败记录失败:', error);
    }
  }

  async checkSubscriptionExists(userId, rssUrl) {
    const result = await this.db.prepare(
      'SELECT id FROM subscriptions WHERE user_id = ? AND rss_url = ?'
    ).bind(userId, rssUrl).first();
    return !!result;
  }

  async deleteSubscription(userId, rssUrl) {
    try {
      const result = await this.db.prepare(
        'DELETE FROM subscriptions WHERE user_id = ? AND rss_url = ?'
      ).bind(userId, rssUrl).run();
      return result.changes > 0;
    } catch (error) {
      console.error('删除订阅时发生错误:', error);
      return false;
    }
  }

  async getUserSubscriptions(userId) {
    const result = await this.db.prepare(
      'SELECT * FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC'
    ).bind(userId).all();
    return result.results || [];
  }

  async getAllSubscriptions() {
    const result = await this.db.prepare(
      'SELECT id, user_id, rss_url, site_name, created_at FROM subscriptions'
    ).all();
    return result.results || [];
  }

  async getSubscribersByRssUrl(rssUrl) {
    const result = await this.db.prepare(
      'SELECT user_id, site_name FROM subscriptions WHERE rss_url = ?'
    ).bind(rssUrl).all();
    return result.results || [];
  }

  async checkItemExists(rssUrl, guid) {
    const result = await this.db.prepare(
      'SELECT id FROM rss_items WHERE rss_url = ? AND item_guid = ?'
    ).bind(rssUrl, guid).first();
    return !!result;
  }

  async saveRSSItem(rssUrl, item) {
    try {
      await this.db.prepare(
        'INSERT INTO rss_items (rss_url, item_guid, title, link, published_at) VALUES (?, ?, ?, ?, ?)'
      ).bind(
        rssUrl,
        item.guid,
        item.title,
        item.link || null,
        item.publishedAt || null
      ).run();
    } catch (error) {
      if (!error.message.includes('UNIQUE constraint failed')) {
        throw error;
      }
    }
  }

  async cleanupOldItems(days = 30) {
    try {
      // 删除旧的RSS文章记录
      const result = await this.db.prepare(
        'DELETE FROM rss_items WHERE created_at < datetime("now", "-" || ? || " days")'
      ).bind(days).run();
      
      console.log(`清理了 ${result.changes} 条旧记录`);
      return result.changes;
    } catch (error) {
      console.error('清理旧记录失败:', error);
      return 0;
    }
  }

  // 获取统计信息
  async getStats() {
    try {
      const subCount = await this.db.prepare('SELECT COUNT(*) as count FROM subscriptions').first();
      const itemCount = await this.db.prepare('SELECT COUNT(*) as count FROM rss_items').first();
      const userCount = await this.db.prepare('SELECT COUNT(DISTINCT user_id) as count FROM subscriptions').first();
      
      return {
        subscriptions: subCount?.count || 0,
        items: itemCount?.count || 0,
        users: userCount?.count || 0
      };
    } catch (error) {
      console.error('获取统计信息失败:', error);
      return { subscriptions: 0, items: 0, users: 0 };
    }
  }

  // ========== 用户推送模式管理 ==========
  
  // 获取用户推送模式
  async getUserPushMode(userId) {
    try {
      const result = await this.db.prepare(
        'SELECT push_mode FROM user_push_modes WHERE user_id = ?'
      ).bind(userId).first();
      return result?.push_mode || 'smart';
    } catch (error) {
      console.error('获取用户推送模式失败:', error);
      return 'smart'; // 默认智能模式
    }
  }

  // 设置用户推送模式
  async setUserPushMode(userId, pushMode) {
    try {
      await this.db.prepare(
        'INSERT OR REPLACE INTO user_push_modes (user_id, push_mode, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)'
      ).bind(userId, pushMode).run();
      return true;
    } catch (error) {
      console.error('设置用户推送模式失败:', error);
      return false;
    }
  }

  // 获取所有用户的推送模式统计
  async getPushModeStats() {
    try {
      const result = await this.db.prepare(
        'SELECT push_mode, COUNT(*) as count FROM user_push_modes GROUP BY push_mode'
      ).all();
      return result.results || [];
    } catch (error) {
      console.error('获取推送模式统计失败:', error);
      return [];
    }
  }
}
