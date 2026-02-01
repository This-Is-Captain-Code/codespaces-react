import express from 'express';
import { botService } from '../services/botService.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

router.use(authMiddleware);

/**
 * Send message to user's bot via OpenClaw gateway
 * Routes through the gateway's OpenAI-compatible endpoint
 * Now supports per-user dedicated gateways
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

    // Per-user gateway: use bot's endpoint and gatewayToken directly
    if (!bot.endpoint || !bot.gatewayToken) {
      return res.status(500).json({ error: 'Bot gateway not configured properly' });
    }

    console.log(`Chat with bot ${bot.botName} on per-user gateway ${bot.endpoint}`);

    const messages = [
      { role: 'system', content: bot.systemPrompt || 'You are a helpful assistant.' },
      { role: 'user', content: message.trim() },
    ];

    // Ensure model has openrouter/ prefix for gateway routing
    let model = bot.model || 'openai/gpt-4o';
    if (!model.startsWith('openrouter/')) {
      model = `openrouter/${model}`;
    }

    const response = await fetch(`${bot.endpoint}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${bot.gatewayToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`OpenClaw API error: ${response.status} - ${errorText}`);
      
      if (response.status === 401) {
        return res.status(401).json({ error: 'Gateway authentication failed' });
      }
      if (response.status === 429) {
        return res.status(429).json({ error: 'Rate limit exceeded. Please try again later.' });
      }
      
      return res.status(500).json({ error: 'Failed to get response from AI' });
    }

    const data = await response.json();
    const assistantMessage = data.choices?.[0]?.message?.content || 'No response';

    res.json({
      response: assistantMessage,
      model: bot.model,
      agentId: bot.agentId,
    });
  } catch (error) {
    console.error(`Chat error: ${error.message}`);

    if (error.name === 'TimeoutError' || error.message.includes('timeout')) {
      return res.status(504).json({ error: 'Request timed out. Please try again.' });
    }

    next(error);
  }
});

/**
 * Get message history via gateway
 * Updated for per-user dedicated gateways
 */
router.get('/history', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { sessionId = 'main', limit = 50 } = req.query;

    const bot = await botService.getBot(userId);
    if (!bot) {
      return res.status(404).json({ error: 'Bot not found' });
    }

    if (bot.status !== 'running' || !bot.endpoint || !bot.gatewayToken) {
      return res.json({ messages: [] });
    }

    try {
      const response = await fetch(`${bot.endpoint}/tools/invoke`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${bot.gatewayToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tool: 'sessions_list',
          action: 'json',
          args: {
            sessionKey: `main-${sessionId}`,
            limit: parseInt(limit),
          },
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        console.log('History fetch failed, returning empty');
        return res.json({ messages: [] });
      }

      const data = await response.json();
      res.json({
        messages: data.result?.messages || [],
        total: data.result?.total || 0,
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
 * Clear message history
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
