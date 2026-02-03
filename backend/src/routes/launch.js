import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { agentLaunchService } from '../services/agentLaunchService.js';
import { botService } from '../services/botService.js';

const router = express.Router();

const isValidEthAddress = (address) => {
  if (!address) return true;
  return /^0x[a-fA-F0-9]{40}$/.test(address);
};

router.post('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      agentName,
      tokenSymbol,
      tokenName,
      model,
      systemPrompt,
      userWalletAddress,
      devRewardAddress,
      limitUsd,
    } = req.body;

    if (!agentName || !agentName.trim()) {
      return res.status(400).json({ error: 'Agent name is required' });
    }

    if (!tokenSymbol || !tokenSymbol.trim()) {
      return res.status(400).json({ error: 'Token symbol is required' });
    }

    if (tokenSymbol.length > 10) {
      return res.status(400).json({ error: 'Token symbol must be 10 characters or less' });
    }

    if (agentName.length > 50) {
      return res.status(400).json({ error: 'Agent name must be 50 characters or less' });
    }

    if (!/^[a-zA-Z0-9]+$/.test(tokenSymbol.trim())) {
      return res.status(400).json({ error: 'Token symbol must be alphanumeric only' });
    }

    if (userWalletAddress && !isValidEthAddress(userWalletAddress)) {
      return res.status(400).json({ error: 'Invalid user wallet address format' });
    }

    if (devRewardAddress && !isValidEthAddress(devRewardAddress)) {
      return res.status(400).json({ error: 'Invalid dev reward address format' });
    }

    const progressUpdates = [];

    const result = await agentLaunchService.launchAgent(userId, {
      agentName: agentName.trim(),
      tokenSymbol: tokenSymbol.trim().toUpperCase(),
      tokenName: tokenName?.trim() || agentName.trim(),
      model,
      systemPrompt,
      userWalletAddress,
      devRewardAddress,
      limitUsd,
    }, (progress) => {
      progressUpdates.push(progress);
    });

    res.json({
      success: true,
      ...result,
      progressUpdates,
    });
  } catch (error) {
    console.error('Launch error:', error);
    res.status(500).json({ 
      error: error.message,
      success: false,
    });
  }
});

router.post('/stream', authMiddleware, async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const sendEvent = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const userId = req.user.id;
    const {
      agentName,
      tokenSymbol,
      tokenName,
      model,
      systemPrompt,
      userWalletAddress,
      devRewardAddress,
      limitUsd,
    } = req.body;

    if (!agentName || !agentName.trim()) {
      sendEvent('error', { error: 'Agent name is required' });
      return res.end();
    }

    if (!tokenSymbol || !tokenSymbol.trim()) {
      sendEvent('error', { error: 'Token symbol is required' });
      return res.end();
    }

    if (tokenSymbol.length > 10) {
      sendEvent('error', { error: 'Token symbol must be 10 characters or less' });
      return res.end();
    }

    if (userWalletAddress && !isValidEthAddress(userWalletAddress)) {
      sendEvent('error', { error: 'Invalid user wallet address format' });
      return res.end();
    }

    if (devRewardAddress && !isValidEthAddress(devRewardAddress)) {
      sendEvent('error', { error: 'Invalid dev reward address format' });
      return res.end();
    }

    sendEvent('started', { message: 'Agent launch started' });

    const result = await agentLaunchService.launchAgent(userId, {
      agentName: agentName.trim(),
      tokenSymbol: tokenSymbol.trim().toUpperCase(),
      tokenName: tokenName?.trim() || agentName.trim(),
      model,
      systemPrompt,
      userWalletAddress,
      devRewardAddress,
      limitUsd,
    }, (progress) => {
      sendEvent('progress', progress);
    });

    sendEvent('complete', { success: true, ...result });
    res.end();
  } catch (error) {
    console.error('Stream launch error:', error);
    sendEvent('error', { error: error.message });
    res.end();
  }
});

router.get('/status', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const status = await agentLaunchService.getLaunchStatus(userId);

    if (!status) {
      return res.json({ hasAgent: false });
    }

    res.json({
      hasAgent: true,
      ...status,
    });
  } catch (error) {
    console.error('Status error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/recover-wallet', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await agentLaunchService.recoverAgentWallet(userId);
    res.json(result);
  } catch (error) {
    console.error('Wallet recovery error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.delete('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    await botService.deleteBot(userId);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
