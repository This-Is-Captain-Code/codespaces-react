import { Router } from 'express';
import { uniswapV4Service } from '../services/uniswapV4Service.js';
import { db } from '../db/index.js';

const router = Router();

router.get('/info', (req, res) => {
  res.json({
    configured: uniswapV4Service.isConfigured(),
    network: uniswapV4Service.getNetworkInfo(),
    hookAddress: uniswapV4Service.getHookAddress(),
  });
});

router.get('/analytics/:tokenAddress', async (req, res) => {
  try {
    const { tokenAddress } = req.params;

    if (!tokenAddress || !/^0x[a-fA-F0-9]{40}$/.test(tokenAddress)) {
      return res.status(400).json({ error: 'Invalid token address' });
    }

    const analytics = await uniswapV4Service.getPoolAnalytics(tokenAddress);
    res.json(analytics);
  } catch (error) {
    console.error('Fee analytics error:', error);
    res.status(500).json({ error: 'Failed to get fee analytics' });
  }
});

router.post('/set-mode', async (req, res) => {
  try {
    const { tokenAddress, feeMode } = req.body;

    if (!tokenAddress || !feeMode) {
      return res.status(400).json({ error: 'tokenAddress and feeMode are required' });
    }

    const validModes = ['conservative', 'balanced', 'aggressive'];
    if (!validModes.includes(feeMode.toLowerCase())) {
      return res.status(400).json({ error: `Invalid fee mode. Must be one of: ${validModes.join(', ')}` });
    }

    const result = await uniswapV4Service.setFeeMode({
      tokenAddress,
      feeMode: feeMode.toLowerCase(),
    });

    res.json(result);
  } catch (error) {
    console.error('Set fee mode error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/set-agent-share', async (req, res) => {
  try {
    const { tokenAddress, shareBps } = req.body;

    if (!tokenAddress || shareBps === undefined) {
      return res.status(400).json({ error: 'tokenAddress and shareBps are required' });
    }

    const bps = parseInt(shareBps);
    if (isNaN(bps) || bps < 200 || bps > 5000) {
      return res.status(400).json({ error: 'shareBps must be between 200 (2%) and 5000 (50%)' });
    }

    const result = await uniswapV4Service.setAgentShare({
      tokenAddress,
      shareBps: bps,
    });

    res.json(result);
  } catch (error) {
    console.error('Set agent share error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/agent/:botId', async (req, res) => {
  try {
    const { botId } = req.params;

    const botResult = await db.query(
      `SELECT token_address, bot_name, token_symbol FROM bots WHERE id = $1`,
      [botId]
    );

    if (botResult.rows.length === 0) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const bot = botResult.rows[0];

    if (!bot.token_address) {
      return res.json({
        configured: false,
        reason: 'Agent has no token deployed',
        agentName: bot.bot_name,
      });
    }

    const analytics = await uniswapV4Service.getPoolAnalytics(bot.token_address);

    res.json({
      ...analytics,
      agentName: bot.bot_name,
      tokenSymbol: bot.token_symbol,
      tokenAddress: bot.token_address,
    });
  } catch (error) {
    console.error('Agent fee analytics error:', error);
    res.status(500).json({ error: 'Failed to get agent fee analytics' });
  }
});

export default router;
