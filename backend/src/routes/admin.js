import express from 'express';
import { db } from '../db/index.js';
import { openrouterProvisioningService } from '../services/openrouterProvisioningService.js';

const router = express.Router();

const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

function adminAuth(req, res, next) {
  if (!ADMIN_TOKEN) {
    return res.status(503).json({ error: 'Admin access not configured' });
  }
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Admin authorization required' });
  }
  const token = authHeader.slice(7);
  if (token !== ADMIN_TOKEN) {
    return res.status(403).json({ error: 'Invalid admin token' });
  }
  next();
}

router.get('/bots', adminAuth, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        b.id as bot_id,
        b.bot_name,
        b.model,
        b.status,
        b.endpoint,
        b.openrouter_key_hash,
        b.openrouter_limit_usd,
        b.created_at,
        u.id as user_id,
        u.email
      FROM bots b
      JOIN users u ON b.user_id = u.id
      ORDER BY b.created_at DESC
    `);

    const bots = await Promise.all(result.rows.map(async (bot) => {
      let usage = null;
      if (bot.openrouter_key_hash) {
        try {
          usage = await openrouterProvisioningService.getKeyInfo(bot.openrouter_key_hash);
        } catch (err) {
          console.error(`Failed to get usage for bot ${bot.bot_id}:`, err.message);
        }
      }
      return {
        botId: bot.bot_id,
        botName: bot.bot_name,
        model: bot.model,
        status: bot.status,
        endpoint: bot.endpoint,
        userId: bot.user_id,
        userEmail: bot.email,
        keyHash: bot.openrouter_key_hash,
        limitUsd: bot.openrouter_limit_usd,
        usageUsd: usage?.usage || 0,
        disabled: usage?.disabled || false,
        createdAt: bot.created_at
      };
    }));

    res.json({ bots });
  } catch (error) {
    console.error('Error listing bots:', error);
    res.status(500).json({ error: 'Failed to list bots' });
  }
});

router.put('/bots/:botId/limit', adminAuth, async (req, res) => {
  try {
    const { botId } = req.params;
    const { limitUsd } = req.body;

    if (typeof limitUsd !== 'number' || limitUsd < 0) {
      return res.status(400).json({ error: 'limitUsd must be a non-negative number' });
    }

    const botResult = await db.query(
      'SELECT openrouter_key_hash, openrouter_limit_usd FROM bots WHERE id = $1',
      [botId]
    );

    if (botResult.rows.length === 0) {
      return res.status(404).json({ error: 'Bot not found' });
    }

    const bot = botResult.rows[0];
    if (!bot.openrouter_key_hash) {
      return res.status(400).json({ error: 'Bot does not have a provisioned OpenRouter key' });
    }

    await openrouterProvisioningService.updateKeyLimit(bot.openrouter_key_hash, limitUsd);

    await db.query(
      'UPDATE bots SET openrouter_limit_usd = $1 WHERE id = $2',
      [limitUsd, botId]
    );

    res.json({ 
      success: true, 
      message: `Limit updated to $${limitUsd}`,
      botId,
      newLimit: limitUsd
    });
  } catch (error) {
    console.error('Error updating bot limit:', error);
    res.status(500).json({ error: 'Failed to update limit' });
  }
});

router.get('/stats', adminAuth, async (req, res) => {
  try {
    const stats = await db.query(`
      SELECT 
        COUNT(DISTINCT b.id) as total_bots,
        COUNT(DISTINCT u.id) as total_users,
        SUM(b.openrouter_limit_usd) as total_limits,
        COUNT(CASE WHEN b.status = 'running' THEN 1 END) as running_bots
      FROM bots b
      JOIN users u ON b.user_id = u.id
    `);

    res.json({
      totalBots: parseInt(stats.rows[0].total_bots) || 0,
      totalUsers: parseInt(stats.rows[0].total_users) || 0,
      totalLimits: parseFloat(stats.rows[0].total_limits) || 0,
      runningBots: parseInt(stats.rows[0].running_bots) || 0
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

export default router;
