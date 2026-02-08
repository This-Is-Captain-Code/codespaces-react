import { db } from '../db/index.js';
import { gatewayService } from './gatewayService.js';
import { openclawService } from './openclawService.js';
import { flyService } from './flyService.js';
import { openrouterProvisioningService } from './openrouterProvisioningService.js';
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
      console.log(`Creating bot for user ${userId} with dedicated instance...`);

      let userOpenRouterKey = null;
      let openrouterKeyHash = null;
      const DEFAULT_LIMIT_USD = 5.00;
      const limitUsd = config.limitUsd != null ? config.limitUsd : DEFAULT_LIMIT_USD;

      if (openrouterProvisioningService.isProvisioningConfigured()) {
        console.log('Creating per-user OpenRouter API key via provisioning...');
        const keyResult = await openrouterProvisioningService.createUserKey({
          name: `MoltRack-${config.botName || 'bot'}-${userId.substring(0, 8)}`,
          limitUsd: limitUsd,
          userId: userId,
        });
        userOpenRouterKey = keyResult.key;
        openrouterKeyHash = keyResult.keyHash;
        console.log(`Created OpenRouter key with hash: ${openrouterKeyHash}${limitUsd ? ` (limit: $${limitUsd})` : ''}`);
      } else {
        console.log('No provisioning key configured, using shared OPENROUTER_API_KEY');
      }

      let userGateway;
      try {
        // Create dedicated Fly.io instance for this user with their own key
        userGateway = await flyService.createUserGateway(userId, {
          model: config.model || 'openai/gpt-4o',
          systemPrompt: config.systemPrompt || 'You are a helpful assistant.',
          botName: config.botName || 'Assistant',
          openrouterApiKey: userOpenRouterKey,
        });
      } catch (flyError) {
        // Cleanup provisioned key if Fly.io deployment fails
        if (openrouterKeyHash && openrouterProvisioningService.isProvisioningConfigured()) {
          console.log('Fly.io deployment failed, cleaning up provisioned OpenRouter key...');
          try {
            await openrouterProvisioningService.deleteKey(openrouterKeyHash);
            console.log(`Cleaned up OpenRouter key: ${openrouterKeyHash}`);
          } catch (cleanupError) {
            console.warn(`Failed to cleanup OpenRouter key: ${cleanupError.message}`);
          }
        }
        throw flyError;
      }

      let botResult;
      try {
        // Store bot with per-user gateway info and OpenRouter key metadata
        botResult = await db.query(
          `INSERT INTO bots (user_id, bot_name, endpoint, model, system_prompt, status, gateway_id, agent_id, fly_gateway_token, openrouter_key_hash, openrouter_limit_usd)
           VALUES ($1, $2, $3, $4, $5, 'running', $6, $7, $8, $9, $10)
           RETURNING id, bot_name, model, system_prompt, status, created_at`,
          [
            userId,
            config.botName || `Bot for ${userId.substring(0, 8)}`,
            userGateway.endpoint,
            config.model || 'openai/gpt-4o',
            config.systemPrompt || 'You are a helpful assistant.',
            userGateway.appName,
            'main',
            userGateway.gatewayToken,
            openrouterKeyHash,
            limitUsd,
          ]
        );
      } catch (dbError) {
        // Cleanup both Fly.io gateway and provisioned key if DB insert fails
        console.log('DB insert failed, cleaning up resources...');
        try {
          await flyService.deleteUserGateway(userGateway.appName);
        } catch (cleanupError) {
          console.warn(`Failed to cleanup Fly.io gateway: ${cleanupError.message}`);
        }
        if (openrouterKeyHash && openrouterProvisioningService.isProvisioningConfigured()) {
          try {
            await openrouterProvisioningService.deleteKey(openrouterKeyHash);
          } catch (cleanupError) {
            console.warn(`Failed to cleanup OpenRouter key: ${cleanupError.message}`);
          }
        }
        throw dbError;
      }
      
      const bot = botResult.rows[0];
      const botId = bot.id;

      // Generate bot token
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

      console.log(`Bot created with dedicated instance: ${botId} -> ${userGateway.endpoint}`);

      return {
        botId,
        token,
        endpoint: userGateway.endpoint,
        gatewayToken: userGateway.gatewayToken,
        controlUrl: userGateway.controlUrl,
        model: bot.model,
        systemPrompt: bot.system_prompt,
        botName: bot.bot_name,
        status: 'running',
        appName: userGateway.appName,
      };
    } catch (error) {
      console.error(`Failed to create bot: ${error.message}`);
      throw error;
    }
  },

  getBot: async (userId) => {
    const result = await db.query(
      `SELECT b.id, b.bot_name, b.gateway_id, b.agent_id, b.endpoint, b.model, b.system_prompt, b.status, b.created_at, b.token_hash, b.fly_gateway_token, b.openrouter_key_hash, b.openrouter_limit_usd
       FROM bots b
       WHERE b.user_id = $1`,
      [userId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const bot = result.rows[0];
    
    // For per-user gateways, gateway token is stored in fly_gateway_token column
    const gatewayToken = bot.fly_gateway_token;
    const controlUrl = bot.endpoint && gatewayToken
      ? `${bot.endpoint}/?token=${gatewayToken}`
      : (bot.endpoint ? `${bot.endpoint}/` : null);

    return {
      id: bot.id,
      botId: bot.id,
      endpoint: bot.endpoint,
      gatewayToken: gatewayToken,
      gatewayId: bot.gateway_id,
      controlUrl: controlUrl,
      model: bot.model,
      systemPrompt: bot.system_prompt,
      botName: bot.bot_name,
      status: bot.status,
      createdAt: bot.created_at,
      agentId: bot.agent_id,
      appName: bot.gateway_id,
      openrouterKeyHash: bot.openrouter_key_hash,
      openrouterLimitUsd: bot.openrouter_limit_usd ? parseFloat(bot.openrouter_limit_usd) : null,
    };
  },

  updateBot: async (userId, config) => {
    const botResult = await db.query(
      `SELECT id, gateway_id, agent_id, fly_gateway_token FROM bots WHERE user_id = $1`,
      [userId]
    );
    
    if (botResult.rows.length === 0) {
      throw new Error('Bot not found for user');
    }
    
    const bot = botResult.rows[0];
    const isPerUserGateway = bot.gateway_id && bot.gateway_id.startsWith('oc-user-');

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

    // For per-user gateways, propagate model/systemPrompt changes to Fly machine
    if (isPerUserGateway && (config.model !== undefined || config.systemPrompt !== undefined)) {
      try {
        await flyService.updateUserGateway(bot.gateway_id, {
          model: config.model,
          systemPrompt: config.systemPrompt,
          gatewayToken: bot.fly_gateway_token,
        });
        console.log(`Updated Fly machine for user gateway ${bot.gateway_id}`);
      } catch (error) {
        console.warn(`Failed to update Fly machine (changes saved to DB): ${error.message}`);
        // Don't throw - DB is updated, Fly update is best-effort
      }
    }

    return botService.getBot(userId);
  },

  reprovisionGateway: async (userId) => {
    const botResult = await db.query(
      `SELECT id, gateway_id, fly_gateway_token, model, system_prompt FROM bots WHERE user_id = $1`,
      [userId]
    );

    if (botResult.rows.length === 0) {
      throw new Error('Bot not found for user');
    }

    const bot = botResult.rows[0];
    if (!bot.gateway_id || !bot.gateway_id.startsWith('oc-user-')) {
      throw new Error('Bot does not have a per-user gateway');
    }

    if (!bot.fly_gateway_token) {
      throw new Error('No gateway token found in database');
    }

    console.log(`Reprovisioning gateway ${bot.gateway_id} with token...`);

    await flyService.updateUserGateway(bot.gateway_id, {
      model: bot.model,
      systemPrompt: bot.system_prompt,
      gatewayToken: bot.fly_gateway_token,
    });

    console.log(`Gateway ${bot.gateway_id} reprovisioned successfully`);
    return { success: true, gatewayId: bot.gateway_id };
  },

  deleteBot: async (userId) => {
    const botResult = await db.query(
      `SELECT id, gateway_id, agent_id, openrouter_key_hash FROM bots WHERE user_id = $1`,
      [userId]
    );
    
    if (botResult.rows.length === 0) {
      throw new Error('Bot not found');
    }
    
    const bot = botResult.rows[0];

    // Delete the user's OpenRouter provisioned key
    if (bot.openrouter_key_hash && openrouterProvisioningService.isProvisioningConfigured()) {
      try {
        await openrouterProvisioningService.deleteKey(bot.openrouter_key_hash);
        console.log(`Deleted OpenRouter key: ${bot.openrouter_key_hash}`);
      } catch (error) {
        console.warn(`Failed to delete OpenRouter key: ${error.message}`);
      }
    }

    // For per-user gateways, gateway_id stores the Fly app name
    if (bot.gateway_id && bot.gateway_id.startsWith('oc-user-')) {
      try {
        await flyService.deleteUserGateway(bot.gateway_id);
        console.log(`Deleted Fly.io app: ${bot.gateway_id}`);
      } catch (error) {
        console.warn(`Failed to delete Fly.io app: ${error.message}`);
      }
    } else if (bot.gateway_id && bot.agent_id) {
      // Legacy shared gateway cleanup
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
        gatewayToken: row.fly_gateway_token,
        model: row.model,
        systemPrompt: row.system_prompt,
        status: row.status,
        appName: row.gateway_id,
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
      `SELECT b.id, b.gateway_id, b.agent_id, b.endpoint, b.status
       FROM bots b
       WHERE b.user_id = $1`,
      [userId]
    );
    
    if (botResult.rows.length === 0) {
      throw new Error('Bot not found');
    }
    
    const bot = botResult.rows[0];

    // For per-user gateways, check Fly.io machine status
    if (bot.gateway_id && bot.gateway_id.startsWith('oc-user-')) {
      try {
        const status = await flyService.getUserGatewayStatus(bot.gateway_id);
        const isHealthy = status.status === 'started';
        
        if (isHealthy && bot.status !== 'running') {
          await db.query(
            `UPDATE bots SET status = 'running', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
            [bot.id]
          );
        }

        return {
          botId: bot.id,
          status: isHealthy ? 'running' : bot.status,
          endpoint: bot.endpoint,
          machineStatus: status.status,
        };
      } catch (error) {
        console.warn('Could not check Fly.io status:', error.message);
      }
    }

    return {
      botId: bot.id,
      status: bot.status,
      endpoint: bot.endpoint,
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
    const result = await db.query(`DELETE FROM bots RETURNING id, gateway_id, openrouter_key_hash`);
    
    for (const row of result.rows) {
      // Delete OpenRouter provisioned key
      if (row.openrouter_key_hash && openrouterProvisioningService.isProvisioningConfigured()) {
        try {
          await openrouterProvisioningService.deleteKey(row.openrouter_key_hash);
          console.log(`Deleted OpenRouter key: ${row.openrouter_key_hash}`);
        } catch (error) {
          console.warn(`Failed to delete OpenRouter key: ${error.message}`);
        }
      }
      
      // For per-user gateways, delete the Fly.io app
      if (row.gateway_id && row.gateway_id.startsWith('oc-user-')) {
        try {
          await flyService.deleteUserGateway(row.gateway_id);
          console.log(`Deleted Fly.io app: ${row.gateway_id}`);
        } catch (error) {
          console.warn(`Failed to delete Fly.io app ${row.gateway_id}: ${error.message}`);
        }
      }
    }
    
    console.log(`Deleted ${result.rowCount} bots from database`);
    return result.rowCount;
  },

  getKeyUsage: async (userId) => {
    const botResult = await db.query(
      `SELECT openrouter_key_hash, openrouter_limit_usd FROM bots WHERE user_id = $1`,
      [userId]
    );
    
    if (botResult.rows.length === 0) {
      throw new Error('Bot not found for user');
    }
    
    const bot = botResult.rows[0];
    
    if (!bot.openrouter_key_hash) {
      return {
        hasProvisionedKey: false,
        message: 'Bot is using shared OpenRouter API key (no per-user billing)',
        limitUsd: null,
        usageUsd: null,
      };
    }
    
    if (!openrouterProvisioningService.isProvisioningConfigured()) {
      throw new Error('No OpenRouter provisioning key configured');
    }
    
    const keyInfo = await openrouterProvisioningService.getKeyInfo(bot.openrouter_key_hash);
    
    return {
      hasProvisionedKey: true,
      keyHash: keyInfo.keyHash,
      limitUsd: keyInfo.limitUsd,
      usageUsd: keyInfo.usage,
      disabled: keyInfo.disabled,
      isFreeTier: keyInfo.isFreeTier,
      rateLimit: keyInfo.rateLimit,
    };
  },

  updateKeyLimit: async (userId, newLimitUsd) => {
    const botResult = await db.query(
      `SELECT id, openrouter_key_hash FROM bots WHERE user_id = $1`,
      [userId]
    );
    
    if (botResult.rows.length === 0) {
      throw new Error('Bot not found for user');
    }
    
    const bot = botResult.rows[0];
    
    if (!bot.openrouter_key_hash) {
      throw new Error('No OpenRouter provisioned key for this bot');
    }
    
    if (!openrouterProvisioningService.isProvisioningConfigured()) {
      throw new Error('No OpenRouter provisioning key configured');
    }
    
    const result = await openrouterProvisioningService.updateKeyLimit(bot.openrouter_key_hash, newLimitUsd);
    
    // Update local DB record
    await db.query(
      `UPDATE bots SET openrouter_limit_usd = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [newLimitUsd, bot.id]
    );
    
    return {
      keyHash: result.keyHash,
      limitUsd: result.limitUsd,
      usageUsd: result.usage,
    };
  },
};
