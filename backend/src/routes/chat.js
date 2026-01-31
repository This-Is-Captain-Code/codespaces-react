import express from 'express';
import { botService } from '../services/botService.js';
import { authMiddleware } from '../middleware/auth.js';
import { db } from '../db/index.js';
import axios from 'axios';

const router = express.Router();

router.use(authMiddleware);

/**
 * Send message to user's bot via OpenClaw tools/invoke API
 * Bypasses WebSocket pairing requirement
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
      return res.status(404).json({ error: 'Bot not found. Create one with POST /api/bots/create' });
    }

    if (bot.status !== 'running') {
      return res.status(400).json({ error: 'Bot is not running yet. Please wait for deployment.' });
    }

    const gatewayResult = await db.query(
      'SELECT * FROM gateways WHERE id = $1 LIMIT 1',
      [bot.gatewayId]
    );
    if (!gatewayResult.rows.length) {
      return res.status(500).json({ error: 'Gateway not found' });
    }

    const gateway = gatewayResult.rows[0];
    const gatewayEndpoint = gateway.endpoint;
    const gatewayToken = gateway.gateway_token;

    console.log(`Sending message to OpenClaw gateway: ${gatewayEndpoint} for agent: ${bot.agentId}`);

    const response = await axios.post(`${gatewayEndpoint}/tools/invoke`, {
      tool: 'agent_chat',
      action: 'json',
      args: {
        message: message.trim(),
        agentId: bot.agentId,
      },
      sessionKey: `${bot.id}-${sessionId}`,
    }, {
      timeout: 60000,
      headers: {
        'Authorization': `Bearer ${gatewayToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.data.ok === false) {
      return res.status(400).json({ 
        error: response.data.error?.message || 'Agent error',
        response: null 
      });
    }

    res.json({
      response: response.data.result?.content || response.data.result?.message || response.data.result || 'No response',
      model: bot.model,
    });
  } catch (error) {
    console.error(`Chat error: ${error.message}`);

    if (error.response?.status === 401) {
      return res.status(401).json({ error: 'Gateway authentication failed' });
    }

    if (error.response?.status === 404) {
      return res.status(404).json({ error: 'Agent tool not found. The gateway may not support chat.' });
    }

    if (error.code === 'ECONNREFUSED' || error.message.includes('ECONNREFUSED')) {
      return res.status(503).json({ error: 'Bot service unavailable. Please try again.' });
    }

    if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
      return res.status(504).json({ error: 'Request timed out. The agent is taking too long.' });
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
