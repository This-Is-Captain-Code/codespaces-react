import { Router } from 'express';
import { intentService } from '../services/intentService.js';
import { yellowNetworkService } from '../services/yellowNetworkService.js';
import { lifiService } from '../services/lifiService.js';
import { uniswapV4Service } from '../services/uniswapV4Service.js';
import { db } from '../db/index.js';
import { privateKeyToAccount } from 'viem/accounts';

const router = Router();

function getAdminWalletAddress() {
  const key = process.env.ADMIN_WALLET_PRIVATE_KEY;
  if (!key) return null;
  try {
    const account = privateKeyToAccount(key);
    return account.address;
  } catch { return null; }
}

router.get('/status', (req, res) => {
  res.json({
    layers: {
      decision: { name: 'OpenClaw', status: 'active' },
      intentBuffer: yellowNetworkService.getStatus(),
      movement: lifiService.getStatus(),
      deployment: {
        configured: uniswapV4Service.isConfigured(),
        ...uniswapV4Service.getNetworkInfo(),
        primaryChain: uniswapV4Service.getPrimaryChain(),
        supportedChains: uniswapV4Service.getSupportedChains(),
      },
    },
  });
});

router.post('/intents', async (req, res) => {
  try {
    const { botId, intentType, sourceChain, destChain, tokenAddress, tokenSymbol, amount, conditions, executionParams } = req.body;

    if (!intentType) {
      return res.status(400).json({ error: 'intentType is required' });
    }

    const intent = await intentService.createIntent({
      botId: botId || null,
      intentType,
      sourceChain: sourceChain || 'base',
      destChain: destChain || 'arbitrum',
      tokenAddress,
      tokenSymbol,
      amount,
      conditions: conditions || {},
      executionParams: executionParams || {},
    });

    res.json({ success: true, intent });
  } catch (error) {
    console.error('Create intent error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/intents', async (req, res) => {
  try {
    const { botId, status, limit } = req.query;

    let intents;
    if (botId) {
      intents = await intentService.getIntentsByBot(botId, status || null);
    } else {
      intents = await intentService.getRecentIntents(parseInt(limit) || 20);
    }

    res.json({ intents });
  } catch (error) {
    console.error('Get intents error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/intents/:intentId', async (req, res) => {
  try {
    const intent = await intentService.getIntent(req.params.intentId);
    if (!intent) {
      return res.status(404).json({ error: 'Intent not found' });
    }
    res.json({ intent });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/intents/:intentId/cancel', async (req, res) => {
  try {
    const intent = await intentService.cancelIntent(req.params.intentId);
    res.json({ success: true, intent });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/intents/:intentId/buffer', async (req, res) => {
  try {
    const intent = await intentService.getIntent(req.params.intentId);
    if (!intent) {
      return res.status(404).json({ error: 'Intent not found' });
    }
    if (intent.status !== 'pending') {
      return res.status(400).json({ error: `Intent is not pending (status: ${intent.status})` });
    }

    const bufferResult = await yellowNetworkService.bufferIntent(intent);
    res.json({ success: true, buffer: bufferResult });
  } catch (error) {
    console.error('Buffer intent error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/intents/:intentId/release', async (req, res) => {
  try {
    const releaseResult = await yellowNetworkService.releaseIntent(req.params.intentId);
    res.json(releaseResult);
  } catch (error) {
    console.error('Release intent error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/batch/:batchId/release', async (req, res) => {
  try {
    const releaseResult = await yellowNetworkService.checkAndRelease(req.params.batchId);
    res.json(releaseResult);
  } catch (error) {
    console.error('Batch release error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/quote', async (req, res) => {
  try {
    const { fromChain, toChain, fromToken, toToken, fromAmount, fromAddress } = req.body;

    if (!fromChain || !toChain || !fromAmount || !fromAddress) {
      return res.status(400).json({ error: 'fromChain, toChain, fromAmount, and fromAddress are required' });
    }

    const quote = await lifiService.getQuote({
      fromChain,
      toChain,
      fromToken,
      toToken,
      fromAmount,
      fromAddress,
    });

    res.json({ success: true, quote });
  } catch (error) {
    console.error('Quote error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/execute', async (req, res) => {
  try {
    const { intentId } = req.body;

    if (!intentId) {
      return res.status(400).json({ error: 'intentId is required' });
    }

    const intent = await intentService.getIntent(intentId);
    if (!intent) {
      return res.status(404).json({ error: 'Intent not found' });
    }

    if (intent.status !== 'executing' && intent.status !== 'pending') {
      return res.status(400).json({ error: `Intent cannot be executed (status: ${intent.status})` });
    }

    if (intent.status === 'pending') {
      await intentService.updateIntentStatus(intentId, 'executing');
    }

    let fromAddress = intent.execution_params?.fromAddress;
    if (!fromAddress && intent.bot_id) {
      const botResult = await db.query('SELECT agent_wallet_address FROM bots WHERE id = $1', [intent.bot_id]);
      if (botResult.rows[0]?.agent_wallet_address) {
        fromAddress = botResult.rows[0].agent_wallet_address;
      }
    }
    if (!fromAddress) {
      fromAddress = getAdminWalletAddress();
    }
    if (!fromAddress) {
      return res.status(400).json({ error: 'No wallet address available. The agent needs a provisioned wallet to execute transactions.' });
    }

    const quote = await lifiService.getQuote({
      fromChain: intent.source_chain,
      toChain: intent.dest_chain,
      fromToken: intent.token_address || undefined,
      toToken: intent.token_address || undefined,
      fromAmount: intent.amount,
      fromAddress,
    });

    await db.query(
      `INSERT INTO cross_chain_movements (intent_id, source_chain, dest_chain, token_in, token_out, amount_in, lifi_quote, bridge_used, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'quoted')`,
      [intentId, intent.source_chain, intent.dest_chain, quote.fromToken, quote.toToken, intent.amount, JSON.stringify(quote), quote.bridgeUsed]
    );

    const execution = await lifiService.executeRoute({ quote });

    await db.query(
      `UPDATE cross_chain_movements SET status = $1, tx_hash_source = $2 WHERE intent_id = $3`,
      [execution.status === 'DONE' ? 'completed' : 'pending', execution.txHash, intentId]
    );

    await intentService.updateIntentStatus(intentId, 'executing', { lifiRouteId: quote.routeId });

    const bridgeDone = execution.status === 'DONE' || execution.status === 'pending' || execution.status === 'BRIDGE_UNAVAILABLE';
    if (bridgeDone) {
      if (intent.intent_type === 'DEPLOY_CAPITAL' || intent.intent_type === 'MOVE_LIQUIDITY') {
        const deployResult = await uniswapV4Service.addLiquidity({
          tokenAddress: intent.token_address || '0x0000000000000000000000000000000000000000',
          amount: intent.amount,
          chainName: intent.dest_chain,
          hookAddress: intent.hook_address,
        });

        await db.query(
          `INSERT INTO liquidity_positions (bot_id, chain, pool_address, token_address, token_symbol, amount, hook_address, pool_key)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT DO NOTHING`,
          [intent.bot_id, intent.dest_chain, deployResult.poolKey ? JSON.stringify(deployResult.poolKey) : null,
           intent.token_address, intent.token_symbol, intent.amount, deployResult.hookAddress, JSON.stringify(deployResult.poolKey || {})]
        );

        await intentService.updateIntentStatus(intentId, 'completed', {
          poolAddress: deployResult.txHash,
          hookAddress: deployResult.hookAddress,
        });

        return res.json({
          success: true,
          intent: await intentService.getIntent(intentId),
          quote,
          execution,
          deployment: deployResult,
        });
      }

      await intentService.updateIntentStatus(intentId, 'completed');
    }

    res.json({
      success: true,
      intent: await intentService.getIntent(intentId),
      quote,
      execution,
    });
  } catch (error) {
    console.error('Execute error:', error);
    if (req.body.intentId) {
      await intentService.updateIntentStatus(req.body.intentId, 'failed', { errorMessage: error.message }).catch(() => {});
    }
    res.status(500).json({ error: error.message });
  }
});

router.post('/execute-pipeline', async (req, res) => {
  try {
    const { botId, intentType, sourceChain, destChain, tokenAddress, tokenSymbol, amount, conditions, executionParams, skipBuffer } = req.body;

    if (!intentType || !amount) {
      return res.status(400).json({ error: 'intentType and amount are required' });
    }

    const intent = await intentService.createIntent({
      botId: botId || null,
      intentType,
      sourceChain: sourceChain || 'base',
      destChain: destChain || 'arbitrum',
      tokenAddress,
      tokenSymbol,
      amount,
      conditions: conditions || {},
      executionParams: executionParams || {},
    });

    let bufferResult = null;
    if (!skipBuffer) {
      bufferResult = await yellowNetworkService.bufferIntent(intent);

      if (bufferResult.recommendation !== 'ready_to_execute') {
        return res.json({
          success: true,
          stage: 'buffered',
          intent: await intentService.getIntent(intent.id),
          buffer: bufferResult,
          message: 'Intent buffered. Conditions not yet met for execution.',
        });
      }

      const releaseResult = await yellowNetworkService.releaseIntent(intent.id);
      if (!releaseResult.released) {
        return res.json({
          success: true,
          stage: 'held',
          intent: await intentService.getIntent(intent.id),
          buffer: bufferResult,
          message: 'Yellow Network is holding the intent. Conditions not stable.',
        });
      }
    } else {
      await intentService.updateIntentStatus(intent.id, 'executing');
    }

    let fromAddress = executionParams?.fromAddress;
    if (!fromAddress && botId) {
      const botResult = await db.query('SELECT agent_wallet_address FROM bots WHERE id = $1', [botId]);
      if (botResult.rows[0]?.agent_wallet_address) {
        fromAddress = botResult.rows[0].agent_wallet_address;
      }
    }
    if (!fromAddress) {
      fromAddress = getAdminWalletAddress();
    }
    if (!fromAddress) {
      return res.status(400).json({ error: 'No wallet address available. Provide a botId with a provisioned wallet or set ADMIN_WALLET_PRIVATE_KEY.' });
    }

    const quote = await lifiService.getQuote({
      fromChain: sourceChain || 'base',
      toChain: destChain || 'arbitrum',
      fromToken: tokenAddress,
      toToken: tokenAddress,
      fromAmount: amount,
      fromAddress,
    });

    await db.query(
      `INSERT INTO cross_chain_movements (intent_id, source_chain, dest_chain, token_in, token_out, amount_in, lifi_quote, bridge_used, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'executing')`,
      [intent.id, sourceChain || 'base', destChain || 'arbitrum', quote.fromToken, quote.toToken, amount, JSON.stringify(quote), quote.bridgeUsed]
    );

    const execution = await lifiService.executeRoute({ quote });

    let deployment = null;
    const bridgeComplete = execution.status === 'DONE' || execution.status === 'pending' || execution.status === 'BRIDGE_UNAVAILABLE';
    if (bridgeComplete && (intentType === 'DEPLOY_CAPITAL' || intentType === 'MOVE_LIQUIDITY')) {
      try {
        deployment = await uniswapV4Service.addLiquidity({
          tokenAddress: tokenAddress || '0x0000000000000000000000000000000000000000',
          amount,
          chainName: destChain || 'arbitrum',
        });

        await db.query(
          `INSERT INTO liquidity_positions (bot_id, chain, token_address, token_symbol, amount, hook_address, pool_key)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [botId || null, destChain || 'arbitrum', tokenAddress, tokenSymbol, amount,
           deployment.hookAddress, JSON.stringify(deployment.poolKey || {})]
        );
      } catch (deployError) {
        console.warn('[Pipeline] Liquidity deployment skipped:', deployError.message);
        deployment = {
          skipped: true,
          reason: deployError.message,
          message: 'Liquidity deployment requires a deployed MoltFeeRouter hook contract and funded wallet. Bridge step completed successfully.',
        };
      }
    }

    await db.query(
      `UPDATE cross_chain_movements SET status = 'completed', tx_hash_source = $1 WHERE intent_id = $2`,
      [execution.txHash, intent.id]
    );

    await intentService.updateIntentStatus(intent.id, 'completed', {
      lifiRouteId: quote.routeId,
      poolAddress: deployment?.txHash || null,
      hookAddress: deployment?.hookAddress || null,
    });

    res.json({
      success: true,
      stage: 'completed',
      intent: await intentService.getIntent(intent.id),
      buffer: bufferResult,
      quote,
      execution,
      deployment,
    });
  } catch (error) {
    console.error('Pipeline error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/positions', async (req, res) => {
  try {
    const { botId } = req.query;
    let query = 'SELECT * FROM liquidity_positions WHERE status = $1';
    const params = ['active'];

    if (botId) {
      query += ' AND bot_id = $2';
      params.push(botId);
    }

    query += ' ORDER BY created_at DESC';
    const result = await db.query(query, params);
    res.json({ positions: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/movements', async (req, res) => {
  try {
    const { intentId, limit } = req.query;
    let query = 'SELECT * FROM cross_chain_movements';
    const params = [];

    if (intentId) {
      query += ' WHERE intent_id = $1';
      params.push(intentId);
    }

    query += ' ORDER BY created_at DESC';

    if (limit) {
      query += ` LIMIT $${params.length + 1}`;
      params.push(parseInt(limit));
    }

    const result = await db.query(query, params);
    res.json({ movements: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/observe', async (req, res) => {
  try {
    const { tokenAddress, chain } = req.query;

    const poolState = await uniswapV4Service.observePoolState({
      tokenAddress: tokenAddress || '0x0000000000000000000000000000000000000000',
      chainName: chain || 'arbitrum',
    });

    const yellowStatus = await yellowNetworkService.getBufferAnalytics();

    const recentIntents = await intentService.getRecentIntents(5);

    const positionsResult = await db.query(
      "SELECT * FROM liquidity_positions WHERE status = 'active' ORDER BY created_at DESC LIMIT 10"
    );

    res.json({
      poolState,
      buffer: yellowStatus,
      recentIntents,
      activePositions: positionsResult.rows,
      chains: {
        source: 'base',
        destination: 'arbitrum',
      },
    });
  } catch (error) {
    console.error('Observe error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/yellow/status', async (req, res) => {
  try {
    const status = yellowNetworkService.getStatus();
    const analytics = await yellowNetworkService.getBufferAnalytics();
    res.json({ success: true, ...status, analytics });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/yellow/connect', async (req, res) => {
  try {
    const result = await yellowNetworkService.connect();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/yellow/disconnect', (req, res) => {
  try {
    const result = yellowNetworkService.disconnect();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/yellow/config', async (req, res) => {
  try {
    const config = await yellowNetworkService.getClearNodeConfig();
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/yellow/balances', async (req, res) => {
  try {
    const balances = await yellowNetworkService.getLedgerBalances();
    res.json(balances);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/yellow/gas-prices', async (req, res) => {
  try {
    const prices = await yellowNetworkService.getGasPrices();
    res.json({ success: true, prices });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/yellow/test-buffer', async (req, res) => {
  try {
    const intent = await intentService.createIntent({
      botId: null,
      intentType: 'MOVE_LIQUIDITY',
      sourceChain: req.body.sourceChain || 'base',
      destChain: req.body.destChain || 'arbitrum',
      tokenAddress: null,
      tokenSymbol: 'USDC',
      amount: req.body.amount || '100',
      conditions: req.body.conditions || { maxGasPriceGwei: 5.0, minFeeGainPercent: 0.3 },
      executionParams: {},
    });

    const bufferResult = await yellowNetworkService.bufferIntent(intent);
    res.json({ success: true, intent, buffer: bufferResult });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/analytics', async (req, res) => {
  try {
    const [intentStats, positionStats, movementStats] = await Promise.all([
      db.query(`
        SELECT status, COUNT(*) as count
        FROM liquidity_intents
        GROUP BY status
      `),
      db.query(`
        SELECT chain, COUNT(*) as count, SUM(CAST(amount AS NUMERIC)) as total_amount
        FROM liquidity_positions
        WHERE status = 'active'
        GROUP BY chain
      `),
      db.query(`
        SELECT status, COUNT(*) as count
        FROM cross_chain_movements
        GROUP BY status
      `),
    ]);

    res.json({
      intents: intentStats.rows,
      positions: positionStats.rows,
      movements: movementStats.rows,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
