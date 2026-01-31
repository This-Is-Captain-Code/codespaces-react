import express from 'express';
import { botService } from '../services/botService.js';
import { authMiddleware } from '../middleware/auth.js';
import { db } from '../db/index.js';
import axios from 'axios';

const router = express.Router();

router.use(authMiddleware);

/**
 * Send message to user's bot via OpenRouter
 * Uses the bot's configured model and system prompt
 * OpenClaw gateway on Fly.io provides persistent agent infrastructure
 */
router.post('/message', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { message, sessionId = 'main' } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const bot = await botService.getBot(userId);
    if (!bot) {
      return res.status(404).json({ error: 'Bot not found. Create one first.' });
    }

    if (bot.status !== 'running') {
      return res.status(400).json({ error: 'Bot is not running yet. Please wait.' });
    }

    const openRouterKey = process.env.OPENROUTER_API_KEY;
    if (!openRouterKey) {
      return res.status(500).json({ error: 'AI service not configured' });
    }

    console.log(`Chat with bot ${bot.botName} using ${bot.model}`);

    const messages = [
      { role: 'system', content: bot.systemPrompt || 'You are a helpful assistant.' },
      { role: 'user', content: message.trim() },
    ];

    const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
      model: bot.model || 'openai/gpt-4o',
      messages,
    }, {
      timeout: 60000,
      headers: {
        'Authorization': `Bearer ${openRouterKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://moltrack.replit.app',
        'X-Title': 'MoltRack',
      },
    });

    const assistantMessage = response.data.choices?.[0]?.message?.content || 'No response';

    res.json({
      response: assistantMessage,
      model: bot.model,
    });
  } catch (error) {
    console.error(`Chat error: ${error.message}`);

    if (error.response?.status === 401) {
      return res.status(401).json({ error: 'AI service authentication failed' });
    }

    if (error.response?.status === 429) {
      return res.status(429).json({ error: 'Rate limit exceeded. Please try again later.' });
    }

    if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
      return res.status(504).json({ error: 'Request timed out. Please try again.' });
    }

    next(error);
  }
});

/**
 * Get message history via gateway tools/invoke API
 */
router.get('/history', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { sessionId = 'main', limit = 50 } = req.query;

    const bot = await botService.getBot(userId);
    if (!bot) {
      return res.status(404).json({ error: 'Bot not found' });
    }

    if (bot.status !== 'running') {
      return res.json({ messages: [] });
    }

    const gatewayResult = await db.query(
      'SELECT * FROM gateways WHERE id = $1 LIMIT 1',
      [bot.gatewayId]
    );
    if (!gatewayResult.rows.length) {
      return res.json({ messages: [] });
    }

    const gateway = gatewayResult.rows[0];

    try {
      const response = await axios.post(`${gateway.endpoint}/tools/invoke`, {
        tool: 'sessions_list',
        action: 'json',
        args: {
          sessionKey: `${bot.id}-${sessionId}`,
          limit: parseInt(limit),
        },
      }, {
        timeout: 10000,
        headers: {
          'Authorization': `Bearer ${gateway.gateway_token}`,
          'Content-Type': 'application/json',
        },
      });

      res.json({
        messages: response.data.result?.messages || [],
        total: response.data.result?.total || 0,
      });
    } catch (err) {
      console.log('History fetch failed, returning empty:', err.message);
      res.json({ messages: [] });
    }
  } catch (error) {
    console.error(`Error fetching history: ${error.message}`);
    res.json({ messages: [] });
  }
});

/**
 * Clear message history - currently only clears local session
 * Note: OpenClaw tools/invoke may not support direct history clear
 */
router.post('/clear', async (req, res, next) => {
  try {
    res.json({
      success: true,
      message: 'Chat cleared (local only)',
    });
  } catch (error) {
    console.error(`Error clearing history: ${error.message}`);
    next(error);
  }
});

export default router;
