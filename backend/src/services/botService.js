import { v4 as uuidv4 } from 'uuid';
import { railwayService } from './railwayService.js';
import crypto from 'crypto';

/**
 * Bot Service
 * Each user has exactly ONE bot
 * The bot is a long-lived Railway service running OpenClaw
 */

// In-memory storage (replace with database)
const userBots = new Map(); // userId → bot
const botTokens = new Map(); // botId → token

export const botService = {
  /**
   * Create a bot for a user (called on first onboarding)
   * @param {string} userId - User ID
   * @param {string} openrouterApiKey - OpenRouter API key
   * @param {Object} config - Bot configuration
   * @returns {Promise<Object>} Bot with token
   */
  createBot: async (userId, openrouterApiKey, config = {}) => {
    // Check if user already has a bot
    if (userBots.has(userId)) {
      throw new Error('User already has a bot. Use updateBot() to modify.');
    }

    try {
      const botId = uuidv4();
      console.log(`🤖 Creating bot ${botId} for user ${userId}...`);

      // Create Railway service
      const railwayInfo = await railwayService.createBotService(
        userId,
        botId,
        openrouterApiKey,
        config
      );

      // Generate token (represents the bot identity)
      const token = `${botId}:${crypto.randomBytes(16).toString('hex')}`;
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

      // Store bot
      const bot = {
        botId,
        userId,
        railwayServiceId: railwayInfo.railwayServiceId,
        endpoint: railwayInfo.endpoint,
        tokenHash,
        model: config.model || 'gpt-3.5-turbo',
        systemPrompt: config.systemPrompt || 'You are a helpful assistant.',
        botName: config.botName || `Bot for ${userId.substring(0, 8)}`,
        status: 'running',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        openrouterApiKey, // Store for later reference (should be encrypted in production)
      };

      userBots.set(userId, bot);
      botTokens.set(botId, token);

      console.log(`✅ Bot created with endpoint: ${railwayInfo.endpoint}`);

      return {
        botId,
        token, // Return token to user (they can use this for authentication)
        endpoint: railwayInfo.endpoint,
        model: bot.model,
        systemPrompt: bot.systemPrompt,
        botName: bot.botName,
      };
    } catch (error) {
      console.error(`❌ Failed to create bot: ${error.message}`);
      throw error;
    }
  },

  /**
   * Get user's bot
   */
  getBot: async (userId) => {
    const bot = userBots.get(userId);
    if (!bot) {
      return null; // User hasn't created bot yet
    }

    return {
      botId: bot.botId,
      endpoint: bot.endpoint,
      model: bot.model,
      systemPrompt: bot.systemPrompt,
      botName: bot.botName,
      status: bot.status,
      createdAt: bot.createdAt,
    };
  },

  /**
   * Update bot configuration (system prompt, model, etc)
   */
  updateBot: async (userId, config) => {
    const bot = userBots.get(userId);
    if (!bot) {
      throw new Error('Bot not found for user');
    }

    try {
      // Update Railway service environment variables
      await railwayService.updateServiceConfig(bot.railwayServiceId, config);

      // Update local storage
      if (config.systemPrompt) bot.systemPrompt = config.systemPrompt;
      if (config.model) bot.model = config.model;
      if (config.botName) bot.botName = config.botName;
      
      bot.updatedAt = new Date().toISOString();
      userBots.set(userId, bot);

      console.log(`✅ Bot ${bot.botId} updated`);

      return {
        botId: bot.botId,
        endpoint: bot.endpoint,
        model: bot.model,
        systemPrompt: bot.systemPrompt,
        botName: bot.botName,
        updatedAt: bot.updatedAt,
      };
    } catch (error) {
      console.error(`❌ Failed to update bot: ${error.message}`);
      throw error;
    }
  },

  /**
   * Delete bot (and Railway service)
   */
  deleteBot: async (userId) => {
    const bot = userBots.get(userId);
    if (!bot) {
      throw new Error('Bot not found');
    }

    try {
      // Delete Railway service
      await railwayService.deleteService(bot.railwayServiceId);

      // Clean up storage
      userBots.delete(userId);
      botTokens.delete(bot.botId);

      console.log(`✅ Bot deleted for user ${userId}`);
      return { success: true };
    } catch (error) {
      console.error(`❌ Failed to delete bot: ${error.message}`);
      throw error;
    }
  },

  /**
   * Get bot by token (for API access)
   */
  getBotByToken: (token) => {
    // Parse token: format is "botId:randomPart"
    const [botId] = token.split(':');
    
    for (const [userId, bot] of userBots) {
      if (bot.botId === botId) {
        return { userId, bot };
      }
    }
    return null;
  },

  /**
   * Regenerate bot token
   */
  regenerateToken: (userId) => {
    const bot = userBots.get(userId);
    if (!bot) {
      throw new Error('Bot not found');
    }

    const token = `${bot.botId}:${crypto.randomBytes(16).toString('hex')}`;
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    bot.tokenHash = tokenHash;
    userBots.set(userId, bot);
    botTokens.set(bot.botId, token);

    console.log(`✅ Token regenerated for bot ${bot.botId}`);
    return token;
  },

  /**
   * Get bot endpoint (for routing messages)
   */
  getBotEndpoint: (userId) => {
    const bot = userBots.get(userId);
    if (!bot) {
      throw new Error('Bot not found');
    }
    return bot.endpoint;
  },

  /**
   * Check bot status with Railway
   */
  checkBotStatus: async (userId) => {
    const bot = userBots.get(userId);
    if (!bot) {
      throw new Error('Bot not found');
    }

    try {
      const status = await railwayService.getServiceStatus(bot.railwayServiceId);
      bot.status = status.status === 'SUCCESS' ? 'running' : status.status;
      bot.endpoint = status.endpoint || bot.endpoint;
      userBots.set(userId, bot);

      return {
        botId: bot.botId,
        status: bot.status,
        endpoint: bot.endpoint,
      };
    } catch (error) {
      console.error(`⚠️  Failed to check status: ${error.message}`);
      bot.status = 'error';
      userBots.set(userId, bot);
      return {
        botId: bot.botId,
        status: 'error',
        error: error.message,
      };
    }
  },

  /**
   * List all bots (admin only)
   */
  getAllBots: () => {
    const bots = [];
    for (const [userId, bot] of userBots) {
      bots.push({
        botId: bot.botId,
        userId,
        status: bot.status,
        endpoint: bot.endpoint,
        model: bot.model,
        createdAt: bot.createdAt,
      });
    }
    return bots;
  },
};
