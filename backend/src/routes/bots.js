import express from 'express';
import { botService } from '../services/botService.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

router.use(authMiddleware);

/**
 * Create a bot for the user
 * Called on first onboarding - user gets ONE bot
 */
router.post('/create', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { systemPrompt = '', model = 'gpt-3.5-turbo', botName = '' } = req.body;
    const openrouterApiKey = process.env.OPENROUTER_API_KEY;

    if (!openrouterApiKey) {
      return res.status(500).json({ error: 'OpenRouter API key not configured' });
    }

    // Create bot on Railway
    const bot = await botService.createBot(userId, openrouterApiKey, {
      systemPrompt,
      model,
      botName,
    });

    res.status(201).json({
      success: true,
      message: 'Bot created successfully',
      bot,
    });
  } catch (error) {
    console.error(`Error creating bot: ${error.message}`);
    if (error.message.includes('already has a bot')) {
      return res.status(400).json({ error: 'User already has a bot' });
    }
    next(error);
  }
});

/**
 * Get user's bot
 */
router.get('/me', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const bot = await botService.getBot(userId);

    if (!bot) {
      return res.status(404).json({ error: 'Bot not found. Create one first with POST /api/bots/create' });
    }

    res.json(bot);
  } catch (error) {
    next(error);
  }
});

/**
 * Update bot configuration
 */
router.put('/update', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { systemPrompt, model, botName } = req.body;

    const config = {};
    if (systemPrompt !== undefined) config.systemPrompt = systemPrompt;
    if (model !== undefined) config.model = model;
    if (botName !== undefined) config.botName = botName;

    if (Object.keys(config).length === 0) {
      return res.status(400).json({ error: 'No configuration provided to update' });
    }

    const bot = await botService.updateBot(userId, config);
    res.json({
      success: true,
      message: 'Bot updated',
      bot,
    });
  } catch (error) {
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * Get bot status
 */
router.get('/status', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const status = await botService.checkBotStatus(userId);
    res.json(status);
  } catch (error) {
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * Regenerate bot token
 */
router.post('/regenerate-token', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const newToken = await botService.regenerateToken(userId);

    res.json({
      success: true,
      message: 'Token regenerated',
      token: newToken,
    });
  } catch (error) {
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * Delete bot (careful!)
 */
router.delete('/delete', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { confirm } = req.body;

    if (confirm !== 'DELETE_BOT') {
      return res.status(400).json({ error: 'Confirmation required: send { confirm: "DELETE_BOT" }' });
    }

    await botService.deleteBot(userId);
    res.json({
      success: true,
      message: 'Bot deleted permanently',
    });
  } catch (error) {
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * List all bots (admin only)
 */
router.get('/admin/list', async (req, res, next) => {
  try {
    // In production, verify admin role
    const bots = botService.getAllBots();
    res.json({
      total: bots.length,
      bots,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
