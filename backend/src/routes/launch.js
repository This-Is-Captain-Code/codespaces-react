import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { agentLaunchService } from '../services/agentLaunchService.js';
import { botService } from '../services/botService.js';

const router = express.Router();

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
