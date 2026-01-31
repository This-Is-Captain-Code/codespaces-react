import express from 'express';
import { botService } from '../services/botService.js';
import { authMiddleware } from '../middleware/auth.js';
import axios from 'axios';

const router = express.Router();

router.use(authMiddleware);

/**
 * Send message to user's bot
 * Routes to the Railway service endpoint
 */
router.post('/message', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { message, model } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Get user's bot
    const bot = await botService.getBot(userId);
    if (!bot) {
      return res.status(404).json({ error: 'Bot not found. Create one with POST /api/bots/create' });
    }

    // Route to Railway service endpoint
    console.log(`💬 Routing message to bot endpoint: ${bot.endpoint}`);
    
    const response = await axios.post(`${bot.endpoint}/api/message`, {
      message: message.trim(),
      model: model || bot.model,
    }, {
      timeout: 30000, // 30 second timeout
      headers: {
        'Content-Type': 'application/json',
      },
    });

    res.json({
      response: response.data.response || response.data.message,
      model: response.data.model || bot.model,
      usage: response.data.usage || {},
    });
  } catch (error) {
    console.error(`❌ Chat error: ${error.message}`);

    if (error.response?.status === 404) {
      return res.status(404).json({ error: 'Bot not found' });
    }

    if (error.code === 'ECONNREFUSED' || error.message.includes('ECONNREFUSED')) {
      return res.status(503).json({ error: 'Bot service unavailable. Please try again in a moment.' });
    }

    if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
      return res.status(504).json({ error: 'Bot service timeout. Request took too long.' });
    }

    next(error);
  }
});

/**
 * Get message history
 * Stored in the Railway service
 */
router.get('/history', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { limit = 50 } = req.query;

    const bot = await botService.getBot(userId);
    if (!bot) {
      return res.status(404).json({ error: 'Bot not found' });
    }

    // Request history from Railway service
    const response = await axios.get(`${bot.endpoint}/api/history`, {
      params: { limit },
      timeout: 10000,
    });

    res.json({
      messages: response.data.messages || response.data || [],
      total: response.data.total,
    });
  } catch (error) {
    console.error(`Error fetching history: ${error.message}`);

    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({ error: 'Bot service unavailable' });
    }

    next(error);
  }
});

/**
 * Clear message history
 */
router.post('/clear', async (req, res, next) => {
  try {
    const userId = req.user.id;

    const bot = await botService.getBot(userId);
    if (!bot) {
      return res.status(404).json({ error: 'Bot not found' });
    }

    const response = await axios.post(`${bot.endpoint}/api/clear`, {}, {
      timeout: 10000,
    });

    res.json({
      success: true,
      message: 'History cleared',
    });
  } catch (error) {
    console.error(`Error clearing history: ${error.message}`);
    next(error);
  }
});

export default router;
