import { db } from '../db/index.js';
import { railwayService } from './railwayService.js';
import crypto from 'crypto';

export const botService = {
  createBot: async (userId, openrouterApiKey, config = {}) => {
    const existingBot = await db.query(
      `SELECT id FROM bots WHERE user_id = $1`,
      [userId]
    );
    
    if (existingBot.rows.length > 0) {
      throw new Error('User already has a bot. Use updateBot() to modify.');
    }

    try {
      console.log(`Creating bot for user ${userId}...`);

      const botResult = await db.query(
        `INSERT INTO bots (user_id, bot_name, model, system_prompt, openrouter_api_key_encrypted, status)
         VALUES ($1, $2, $3, $4, $5, 'creating')
         RETURNING id, bot_name, model, system_prompt, status, created_at`,
        [
          userId,
          config.botName || `Bot for ${userId.substring(0, 8)}`,
          config.model || 'gpt-3.5-turbo',
          config.systemPrompt || 'You are a helpful assistant.',
          openrouterApiKey,
        ]
      );
      
      const bot = botResult.rows[0];
      const botId = bot.id;

      let railwayInfo = null;
      let endpoint = null;

      let setupPassword = null;

      if (process.env.RAILWAY_API_TOKEN && process.env.RAILWAY_PROJECT_ID && process.env.RAILWAY_ENVIRONMENT_ID) {
        try {
          railwayInfo = await railwayService.createBotService(
            userId,
            botId,
            openrouterApiKey,
            config
          );
          endpoint = railwayInfo.endpoint;
          setupPassword = railwayInfo.setupPassword;

          await db.query(
            `UPDATE bots SET railway_service_id = $1, endpoint = $2, setup_password = $3, status = 'running' WHERE id = $4`,
            [railwayInfo.railwayServiceId, endpoint, setupPassword, botId]
          );
        } catch (railwayError) {
          console.warn(`Railway deployment failed: ${railwayError.message}`);
          await db.query(
            `UPDATE bots SET status = 'error' WHERE id = $1`,
            [botId]
          );
        }
      } else {
        console.log('Railway not configured, running in demo mode');
        await db.query(
          `UPDATE bots SET status = 'demo_mode' WHERE id = $1`,
          [botId]
        );
      }

      const token = `${botId}:${crypto.randomBytes(16).toString('hex')}`;
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

      await db.query(
        `INSERT INTO bot_tokens (bot_id, token) VALUES ($1, $2)`,
        [botId, tokenHash]
      );

      await db.query(
        `UPDATE bots SET token_hash = $1 WHERE id = $2`,
        [tokenHash, botId]
      );

      console.log(`Bot created: ${botId}`);

      return {
        botId,
        token,
        endpoint,
        setupPassword,
        setupUrl: endpoint ? `${endpoint}/setup` : null,
        controlUrl: endpoint ? `${endpoint}/openclaw` : null,
        model: bot.model,
        systemPrompt: bot.system_prompt,
        botName: bot.bot_name,
        status: endpoint ? 'running' : (railwayInfo ? 'error' : 'demo_mode'),
      };
    } catch (error) {
      console.error(`Failed to create bot: ${error.message}`);
      throw error;
    }
  },

  getBot: async (userId) => {
    const result = await db.query(
      `SELECT id, bot_name, railway_service_id, endpoint, setup_password, model, system_prompt, status, created_at
       FROM bots WHERE user_id = $1`,
      [userId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const bot = result.rows[0];
    return {
      botId: bot.id,
      endpoint: bot.endpoint,
      setupPassword: bot.setup_password,
      setupUrl: bot.endpoint ? `${bot.endpoint}/setup` : null,
      controlUrl: bot.endpoint ? `${bot.endpoint}/openclaw` : null,
      model: bot.model,
      systemPrompt: bot.system_prompt,
      botName: bot.bot_name,
      status: bot.status,
      createdAt: bot.created_at,
    };
  },

  updateBot: async (userId, config) => {
    const botResult = await db.query(
      `SELECT id, railway_service_id FROM bots WHERE user_id = $1`,
      [userId]
    );
    
    if (botResult.rows.length === 0) {
      throw new Error('Bot not found for user');
    }
    
    const bot = botResult.rows[0];

    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (config.systemPrompt !== undefined) {
      updates.push(`system_prompt = $${paramIndex++}`);
      values.push(config.systemPrompt);
    }
    if (config.model !== undefined) {
      updates.push(`model = $${paramIndex++}`);
      values.push(config.model);
    }
    if (config.botName !== undefined) {
      updates.push(`bot_name = $${paramIndex++}`);
      values.push(config.botName);
    }
    
    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(bot.id);

    await db.query(
      `UPDATE bots SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      values
    );

    if (bot.railway_service_id && process.env.RAILWAY_API_TOKEN) {
      try {
        await railwayService.updateServiceConfig(bot.railway_service_id, config);
      } catch (error) {
        console.warn(`Failed to update Railway config: ${error.message}`);
      }
    }

    return botService.getBot(userId);
  },

  deleteBot: async (userId) => {
    const botResult = await db.query(
      `SELECT id, railway_service_id FROM bots WHERE user_id = $1`,
      [userId]
    );
    
    if (botResult.rows.length === 0) {
      throw new Error('Bot not found');
    }
    
    const bot = botResult.rows[0];

    if (bot.railway_service_id && process.env.RAILWAY_API_TOKEN) {
      try {
        await railwayService.deleteService(bot.railway_service_id);
      } catch (error) {
        console.warn(`Failed to delete Railway service: ${error.message}`);
      }
    }

    await db.query(`DELETE FROM bots WHERE id = $1`, [bot.id]);

    console.log(`Bot deleted for user ${userId}`);
    return { success: true };
  },

  getBotByToken: async (token) => {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    
    const result = await db.query(
      `SELECT b.*, u.id as user_id 
       FROM bots b 
       JOIN users u ON b.user_id = u.id 
       WHERE b.token_hash = $1`,
      [tokenHash]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const row = result.rows[0];
    return {
      userId: row.user_id,
      bot: {
        botId: row.id,
        botName: row.bot_name,
        endpoint: row.endpoint,
        model: row.model,
        systemPrompt: row.system_prompt,
        status: row.status,
      },
    };
  },

  regenerateToken: async (userId) => {
    const botResult = await db.query(
      `SELECT id FROM bots WHERE user_id = $1`,
      [userId]
    );
    
    if (botResult.rows.length === 0) {
      throw new Error('Bot not found');
    }
    
    const botId = botResult.rows[0].id;
    const token = `${botId}:${crypto.randomBytes(16).toString('hex')}`;
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    await db.query(
      `UPDATE bot_tokens SET is_active = false WHERE bot_id = $1`,
      [botId]
    );

    await db.query(
      `INSERT INTO bot_tokens (bot_id, token) VALUES ($1, $2)`,
      [botId, tokenHash]
    );

    await db.query(
      `UPDATE bots SET token_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [tokenHash, botId]
    );

    console.log(`Token regenerated for bot ${botId}`);
    return token;
  },

  getBotEndpoint: async (userId) => {
    const bot = await botService.getBot(userId);
    if (!bot) {
      throw new Error('Bot not found');
    }
    return bot.endpoint;
  },

  checkBotStatus: async (userId) => {
    const botResult = await db.query(
      `SELECT id, railway_service_id, endpoint, status FROM bots WHERE user_id = $1`,
      [userId]
    );
    
    if (botResult.rows.length === 0) {
      throw new Error('Bot not found');
    }
    
    const bot = botResult.rows[0];

    if (!bot.railway_service_id || !process.env.RAILWAY_API_TOKEN) {
      return {
        botId: bot.id,
        status: bot.status,
        endpoint: bot.endpoint,
      };
    }

    try {
      const status = await railwayService.getServiceStatus(bot.railway_service_id);
      const newStatus = status.status === 'SUCCESS' ? 'running' : status.status;
      
      await db.query(
        `UPDATE bots SET status = $1, endpoint = COALESCE($2, endpoint), updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
        [newStatus, status.endpoint, bot.id]
      );

      return {
        botId: bot.id,
        status: newStatus,
        endpoint: status.endpoint || bot.endpoint,
      };
    } catch (error) {
      console.error(`Failed to check status: ${error.message}`);
      await db.query(
        `UPDATE bots SET status = 'error', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [bot.id]
      );
      return {
        botId: bot.id,
        status: 'error',
        error: error.message,
      };
    }
  },

  getAllBots: async () => {
    const result = await db.query(
      `SELECT b.id, b.user_id, b.bot_name, b.status, b.endpoint, b.model, b.created_at
       FROM bots b
       ORDER BY b.created_at DESC`
    );
    
    return result.rows.map(row => ({
      botId: row.id,
      userId: row.user_id,
      botName: row.bot_name,
      status: row.status,
      endpoint: row.endpoint,
      model: row.model,
      createdAt: row.created_at,
    }));
  },

  deleteAllBots: async () => {
    await db.query(`DELETE FROM bot_tokens`);
    const result = await db.query(`DELETE FROM bots RETURNING id`);
    console.log(`Deleted ${result.rowCount} bots from database`);
    return result.rowCount;
  },
};
