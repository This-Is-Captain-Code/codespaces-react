import { db } from '../db/index.js';
import { gatewayService } from './gatewayService.js';
import { openclawService } from './openclawService.js';
import crypto from 'crypto';

export const botService = {
  createBot: async (userId, config = {}) => {
    const existingBot = await db.query(
      `SELECT id FROM bots WHERE user_id = $1`,
      [userId]
    );
    
    if (existingBot.rows.length > 0) {
      throw new Error('User already has a bot. Use updateBot() to modify.');
    }

    try {
      console.log(`Creating bot for user ${userId}...`);

      const gateway = await gatewayService.getAvailableGateway();
      if (!gateway) {
        throw new Error('No available gateway. Please try again later.');
      }

      const agentId = `agent-${userId.substring(0, 8)}-${Date.now()}`;

      const botResult = await db.query(
        `INSERT INTO bots (user_id, bot_name, gateway_id, agent_id, model, system_prompt, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'creating')
         RETURNING id, bot_name, model, system_prompt, status, created_at`,
        [
          userId,
          config.botName || `Bot for ${userId.substring(0, 8)}`,
          gateway.id,
          agentId,
          config.model || 'openai/gpt-4o',
          config.systemPrompt || 'You are a helpful assistant.',
        ]
      );
      
      const bot = botResult.rows[0];
      const botId = bot.id;

      try {
        const agentResult = await openclawService.createAgent(gateway.id, {
          agentId,
          model: config.model || 'openai/gpt-4o',
          systemPrompt: config.systemPrompt,
          botName: config.botName,
        });

        const endpoint = agentResult.endpoint;
        const controlUrl = agentResult.controlUrl;

        await db.query(
          `UPDATE bots SET endpoint = $1, status = 'running' WHERE id = $2`,
          [endpoint, botId]
        );

        const token = crypto.randomBytes(32).toString('hex');
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
          gatewayToken: agentResult.gatewayToken,
          controlUrl,
          model: bot.model,
          systemPrompt: bot.system_prompt,
          botName: bot.bot_name,
          status: 'running',
        };
      } catch (agentError) {
        console.error(`Agent creation failed: ${agentError.message}`);
        await db.query(
          `UPDATE bots SET status = 'error' WHERE id = $1`,
          [botId]
        );
        throw agentError;
      }
    } catch (error) {
      console.error(`Failed to create bot: ${error.message}`);
      throw error;
    }
  },

  getBot: async (userId) => {
    const result = await db.query(
      `SELECT b.id, b.bot_name, b.gateway_id, b.agent_id, b.endpoint, b.model, b.system_prompt, b.status, b.created_at,
              g.gateway_token, g.endpoint as gateway_endpoint
       FROM bots b
       LEFT JOIN gateways g ON b.gateway_id = g.id
       WHERE b.user_id = $1`,
      [userId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const bot = result.rows[0];
    const controlUrl = bot.gateway_endpoint && bot.gateway_token 
      ? `${bot.gateway_endpoint}/?token=${bot.gateway_token}`
      : null;

    return {
      botId: bot.id,
      endpoint: bot.endpoint || bot.gateway_endpoint,
      gatewayToken: bot.gateway_token,
      controlUrl,
      model: bot.model,
      systemPrompt: bot.system_prompt,
      botName: bot.bot_name,
      status: bot.status,
      createdAt: bot.created_at,
      agentId: bot.agent_id,
    };
  },

  updateBot: async (userId, config) => {
    const botResult = await db.query(
      `SELECT id, gateway_id, agent_id FROM bots WHERE user_id = $1`,
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
    
    if (updates.length > 0) {
      updates.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(bot.id);

      await db.query(
        `UPDATE bots SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
        values
      );
    }

    return botService.getBot(userId);
  },

  deleteBot: async (userId) => {
    const botResult = await db.query(
      `SELECT id, gateway_id, agent_id FROM bots WHERE user_id = $1`,
      [userId]
    );
    
    if (botResult.rows.length === 0) {
      throw new Error('Bot not found');
    }
    
    const bot = botResult.rows[0];

    if (bot.gateway_id && bot.agent_id) {
      try {
        await openclawService.deleteAgent(bot.gateway_id, bot.agent_id);
      } catch (error) {
        console.warn(`Failed to delete agent from gateway: ${error.message}`);
      }
    }

    await db.query(`DELETE FROM bot_tokens WHERE bot_id = $1`, [bot.id]);
    await db.query(`DELETE FROM bots WHERE id = $1`, [bot.id]);

    console.log(`Bot deleted for user ${userId}`);
    return { success: true };
  },

  getBotByToken: async (token) => {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    
    const result = await db.query(
      `SELECT b.*, u.id as user_id, g.gateway_token, g.endpoint as gateway_endpoint
       FROM bots b 
       JOIN users u ON b.user_id = u.id 
       LEFT JOIN gateways g ON b.gateway_id = g.id
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
        endpoint: row.endpoint || row.gateway_endpoint,
        gatewayToken: row.gateway_token,
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
    const token = crypto.randomBytes(32).toString('hex');
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
      `SELECT b.id, b.gateway_id, b.agent_id, b.endpoint, b.status,
              g.gateway_token, g.endpoint as gateway_endpoint, g.status as gateway_status
       FROM bots b
       LEFT JOIN gateways g ON b.gateway_id = g.id
       WHERE b.user_id = $1`,
      [userId]
    );
    
    if (botResult.rows.length === 0) {
      throw new Error('Bot not found');
    }
    
    const bot = botResult.rows[0];

    if (!bot.gateway_id) {
      return {
        botId: bot.id,
        status: bot.status,
        endpoint: bot.endpoint,
      };
    }

    const healthCheck = await openclawService.healthCheck(bot.gateway_id);

    if (healthCheck.healthy && bot.status !== 'running') {
      await db.query(
        `UPDATE bots SET status = 'running', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [bot.id]
      );
    }

    return {
      botId: bot.id,
      status: healthCheck.healthy ? 'running' : bot.status,
      endpoint: bot.endpoint || bot.gateway_endpoint,
      gatewayStatus: bot.gateway_status,
    };
  },

  getAllBots: async () => {
    const result = await db.query(
      `SELECT b.id, b.user_id, b.bot_name, b.status, b.endpoint, b.model, b.created_at, b.gateway_id
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
      gatewayId: row.gateway_id,
    }));
  },

  deleteAllBots: async () => {
    await db.query(`DELETE FROM bot_tokens`);
    const result = await db.query(`DELETE FROM bots RETURNING id, gateway_id`);
    
    for (const row of result.rows) {
      if (row.gateway_id) {
        await gatewayService.decrementAgentCount(row.gateway_id);
      }
    }
    
    console.log(`Deleted ${result.rowCount} bots from database`);
    return result.rowCount;
  },
};
