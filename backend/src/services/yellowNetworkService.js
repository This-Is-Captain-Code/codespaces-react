import { intentService } from './intentService.js';
import { clearNodeClient } from './clearNodeClient.js';
import {
  createAppSessionMessage,
  createCloseAppSessionMessage,
  createSubmitAppStateMessage,
  createGetConfigMessage,
  createGetLedgerBalancesMessage,
  createECDSAMessageSigner,
} from '@erc7824/nitrolite';

const USE_TESTNET = process.env.USE_TESTNET === 'true';

const BUFFER_DURATION_MS = 30000;
const MIN_BATCH_SIZE = 1;
const MAX_BATCH_SIZE = 10;

const GAS_PRICE_THRESHOLDS = {
  base: { low: 0.01, medium: 0.1, high: 1.0 },
  arbitrum: { low: 0.01, medium: 0.1, high: 0.5 },
  ethereum: { low: 10, medium: 30, high: 100 },
};

const activeSessions = new Map();
let _initialized = false;
let _initPromise = null;

async function ensureConnected() {
  if (clearNodeClient.isConnected && clearNodeClient.isAuthenticated) {
    return true;
  }
  try {
    const result = await clearNodeClient.connect();
    return result.authenticated;
  } catch (err) {
    console.warn('[Yellow] ClearNode connection failed, using local fallback:', err.message);
    return false;
  }
}

export const yellowNetworkService = {
  isConfigured: () => true,

  getMode: () => {
    if (clearNodeClient.isConnected && clearNodeClient.isAuthenticated) return 'live';
    return 'local_batching';
  },

  getStatus: () => {
    const clearNodeStatus = clearNodeClient.getStatus();
    return {
      configured: true,
      mode: yellowNetworkService.getMode(),
      testnet: USE_TESTNET,
      endpoint: clearNodeStatus.endpoint,
      connected: clearNodeStatus.connected,
      authenticated: clearNodeStatus.authenticated,
      address: clearNodeStatus.address,
      hasJwt: clearNodeStatus.hasJwt,
      activeSessions: activeSessions.size,
      bufferDurationMs: BUFFER_DURATION_MS,
      note: clearNodeStatus.authenticated
        ? 'Connected to Yellow Network ClearSync via Nitrolite'
        : clearNodeStatus.connected
          ? 'Connected to ClearNode but not authenticated'
          : 'Using local intent batching (ClearSync not connected)',
    };
  },

  initialize: async () => {
    if (_initialized) return { success: true, already: true };
    if (_initPromise) return _initPromise;

    _initPromise = (async () => {
      try {
        console.log('[Yellow] Initializing Yellow Network service...');
        const result = await clearNodeClient.connect();
        _initialized = true;
        console.log(`[Yellow] Initialized: connected=${result.connected}, authenticated=${result.authenticated}`);
        return { success: true, ...result };
      } catch (err) {
        console.warn('[Yellow] Initialization failed (local batching active):', err.message);
        _initialized = true;
        return { success: false, error: err.message, fallback: 'local_batching' };
      } finally {
        _initPromise = null;
      }
    })();

    return _initPromise;
  },

  connect: async () => {
    try {
      const result = await clearNodeClient.connect();
      return {
        success: result.authenticated || false,
        connected: result.connected,
        authenticated: result.authenticated || false,
        endpoint: clearNodeClient._getEndpoint(),
        address: clearNodeClient.account?.address || null,
        error: result.error || null,
        mode: result.authenticated ? 'live' : 'local_batching',
        note: result.authenticated
          ? 'Connected and authenticated to Yellow Network ClearSync'
          : result.connected
            ? `WebSocket connected but auth failed: ${result.error || 'Unknown'}. Falling back to local batching. To enable live mode, create a channel at apps.yellow.com with wallet ${clearNodeClient.account?.address}`
            : 'Connection failed. Using local intent batching.',
      };
    } catch (err) {
      return { success: false, error: err.message, mode: 'local_batching' };
    }
  },

  disconnect: () => {
    clearNodeClient.disconnect();
    activeSessions.clear();
    return { success: true, disconnected: true };
  },

  bufferIntent: async (intent) => {
    console.log(`[Yellow] Buffering intent ${intent.id} (${intent.intent_type}) mode: ${yellowNetworkService.getMode()}`);

    const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await intentService.updateIntentStatus(intent.id, 'buffered', { yellowBatchId: batchId });

    const isLive = await ensureConnected();

    if (isLive) {
      return yellowNetworkService._liveBuffer(intent, batchId);
    }
    return yellowNetworkService._localBuffer(intent, batchId);
  },

  _localBuffer: async (intent, batchId) => {
    console.log(`[Yellow/Local] Intent ${intent.id} buffered in batch ${batchId}`);

    const conditionsResult = await yellowNetworkService._evaluateConditions(intent.conditions, intent);
    console.log(`[Yellow/Local] Conditions evaluation: ${JSON.stringify(conditionsResult)}`);

    return {
      batchId,
      intentId: intent.id,
      status: 'buffered',
      conditionsValid: conditionsResult.valid,
      conditionDetails: conditionsResult.details,
      mode: 'local_batching',
      testnet: USE_TESTNET,
      estimatedExecutionTime: new Date(Date.now() + BUFFER_DURATION_MS).toISOString(),
      recommendation: conditionsResult.valid ? 'ready_to_execute' : 'hold',
    };
  },

  _liveBuffer: async (intent, batchId) => {
    console.log(`[Yellow/Live] Buffering intent ${intent.id} via ClearSync state channel`);

    let session = activeSessions.get(batchId);

    try {
      if (!session) {
        session = await yellowNetworkService._createSession(batchId, intent);
        activeSessions.set(batchId, session);
      }

      await yellowNetworkService._submitIntentState(session, intent);

      const conditionsResult = await yellowNetworkService._evaluateConditions(intent.conditions, intent);

      console.log(`[Yellow/Live] Intent ${intent.id} buffered in session ${session.sessionId}`);

      return {
        batchId,
        intentId: intent.id,
        sessionId: session.sessionId,
        status: 'buffered',
        conditionsValid: conditionsResult.valid,
        conditionDetails: conditionsResult.details,
        mode: 'live',
        testnet: USE_TESTNET,
        estimatedExecutionTime: new Date(Date.now() + BUFFER_DURATION_MS).toISOString(),
        recommendation: conditionsResult.valid ? 'ready_to_execute' : 'hold',
      };
    } catch (err) {
      console.warn(`[Yellow/Live] Live buffer failed, falling back to local: ${err.message}`);
      return yellowNetworkService._localBuffer(intent, batchId);
    }
  },

  _createSession: async (batchId, intent) => {
    const address = clearNodeClient.account.address;
    const clearNodeAddress = '0x0000000000000000000000000000000000000001';

    const appDefinition = {
      protocol: 'molt-liquidity-v1',
      participants: [address, clearNodeAddress],
      weights: [100, 0],
      quorum: 100,
      challenge: 0,
      nonce: Date.now(),
    };

    const allocations = [
      { participant: address, asset: 'usdc', amount: intent.amount || '0' },
      { participant: clearNodeAddress, asset: 'usdc', amount: '0' },
    ];

    const messageSigner = createECDSAMessageSigner(clearNodeClient.walletClient);

    const sessionMsg = await createAppSessionMessage(
      messageSigner,
      [{ definition: appDefinition, allocations }]
    );

    const response = await clearNodeClient.sendRequest(sessionMsg);
    const sessionId = response?.params?.app_session_id || `session_${batchId}`;
    console.log(`[Yellow] Created ClearSync session: ${sessionId}`);

    return {
      sessionId,
      batchId,
      signer: messageSigner,
      intents: [],
      isLive: true,
      createdAt: Date.now(),
    };
  },

  _submitIntentState: async (session, intent) => {
    try {
      const intentState = {
        type: 'LIQUIDITY_INTENT',
        intentId: intent.id,
        intentType: intent.intent_type,
        sourceChain: intent.source_chain,
        destChain: intent.dest_chain,
        tokenSymbol: intent.token_symbol,
        amount: intent.amount,
        conditions: intent.conditions,
        timestamp: Date.now(),
      };

      const stateMsg = await createSubmitAppStateMessage(
        session.signer,
        session.sessionId,
        [intentState]
      );

      await clearNodeClient.sendRequest(stateMsg).catch(err => {
        console.warn(`[Yellow] State submit response: ${err.message}`);
      });

      session.intents.push(intent.id);
      console.log(`[Yellow] Submitted intent state ${intent.id} to session ${session.sessionId}`);
    } catch (err) {
      console.warn(`[Yellow] State submission failed (non-critical): ${err.message}`);
      session.intents.push(intent.id);
    }
  },

  _closeSession: async (batchId) => {
    const session = activeSessions.get(batchId);
    if (!session) return;

    try {
      if (session.isLive && clearNodeClient.isConnected && clearNodeClient.isAuthenticated && session.signer) {
        const closeMsg = await createCloseAppSessionMessage(
          session.signer,
          session.sessionId
        );
        await clearNodeClient.sendRequest(closeMsg).catch(err => {
          console.warn(`[Yellow] Session close response: ${err.message}`);
        });
        console.log(`[Yellow] Closed ClearSync session ${session.sessionId}`);
      } else {
        console.log(`[Yellow] Cleaned up local session ${session.sessionId}`);
      }
    } catch (err) {
      console.warn(`[Yellow] Session close error (non-critical): ${err.message}`);
    } finally {
      activeSessions.delete(batchId);
    }
  },

  checkAndRelease: async (batchId) => {
    console.log(`[Yellow] Checking batch ${batchId} for release`);

    const bufferedIntents = await intentService.getBufferedIntents();
    const batchIntents = bufferedIntents.filter(i => i.yellow_batch_id === batchId);

    if (batchIntents.length === 0) {
      return { released: false, reason: 'no_intents_in_batch' };
    }

    const readyIntents = [];
    const holdIntents = [];

    for (const intent of batchIntents) {
      const conditionsResult = await yellowNetworkService._evaluateConditions(intent.conditions, intent);
      if (conditionsResult.valid) {
        readyIntents.push(intent);
      } else {
        holdIntents.push({ ...intent, conditionDetails: conditionsResult.details });
      }
    }

    if (readyIntents.length === 0) {
      return {
        released: false,
        reason: 'conditions_not_met',
        holding: holdIntents.length,
        details: holdIntents.map(i => ({ id: i.id, conditions: i.conditions, conditionDetails: i.conditionDetails })),
      };
    }

    for (const intent of readyIntents) {
      await intentService.updateIntentStatus(intent.id, 'executing');
    }

    if (activeSessions.has(batchId)) {
      await yellowNetworkService._closeSession(batchId);
    }

    console.log(`[Yellow] Released ${readyIntents.length} intents from batch ${batchId}`);

    return {
      released: true,
      count: readyIntents.length,
      intents: readyIntents,
      holding: holdIntents.length,
      mode: yellowNetworkService.getMode(),
    };
  },

  releaseIntent: async (intentId) => {
    const intent = await intentService.getIntent(intentId);
    if (!intent) throw new Error(`Intent ${intentId} not found`);
    if (intent.status !== 'buffered') throw new Error(`Intent ${intentId} is not buffered (status: ${intent.status})`);

    const conditionsResult = await yellowNetworkService._evaluateConditions(intent.conditions, intent);
    if (!conditionsResult.valid) {
      return {
        released: false,
        reason: 'conditions_not_met',
        intent,
        conditionDetails: conditionsResult.details,
      };
    }

    await intentService.updateIntentStatus(intentId, 'executing');
    console.log(`[Yellow] Released intent ${intentId} for execution`);

    return {
      released: true,
      intent: await intentService.getIntent(intentId),
      mode: yellowNetworkService.getMode(),
    };
  },

  _evaluateConditions: async (conditions, intent = null) => {
    const details = {};

    if (!conditions || Object.keys(conditions).length === 0) {
      return { valid: true, details: { noConditions: true } };
    }

    let allValid = true;

    if (conditions.maxGasCostUsd !== undefined || conditions.maxGasPriceGwei !== undefined) {
      const sourceChain = intent?.source_chain || 'base';
      const destChain = intent?.dest_chain || 'arbitrum';

      try {
        const [sourceGas, destGas] = await Promise.all([
          clearNodeClient.getGasPrice(sourceChain),
          clearNodeClient.getGasPrice(destChain),
        ]);

        const sourceGwei = parseFloat(sourceGas.gasPriceGwei || '0');
        const destGwei = parseFloat(destGas.gasPriceGwei || '0');

        details.gasPrice = {
          source: { chain: sourceChain, gwei: sourceGwei },
          dest: { chain: destChain, gwei: destGwei },
        };

        if (conditions.maxGasPriceGwei !== undefined) {
          const maxGwei = parseFloat(conditions.maxGasPriceGwei);
          const sourceOk = sourceGwei <= maxGwei;
          const destOk = destGwei <= maxGwei;
          details.gasPrice.maxGwei = maxGwei;
          details.gasPrice.sourceOk = sourceOk;
          details.gasPrice.destOk = destOk;

          if (!sourceOk || !destOk) {
            allValid = false;
            console.log(`[Yellow] Gas price condition failed: source=${sourceGwei} dest=${destGwei} max=${maxGwei}`);
          }
        }

        if (conditions.maxGasCostUsd !== undefined) {
          const estimatedGasCostUsd = (sourceGwei + destGwei) * 0.00021 * 2500;
          details.gasPrice.estimatedCostUsd = estimatedGasCostUsd;
          details.gasPrice.maxCostUsd = conditions.maxGasCostUsd;

          if (estimatedGasCostUsd > conditions.maxGasCostUsd) {
            allValid = false;
            console.log(`[Yellow] Gas cost condition failed: $${estimatedGasCostUsd} > max $${conditions.maxGasCostUsd}`);
          }
        }
      } catch (err) {
        console.warn('[Yellow] Gas price check failed, assuming valid:', err.message);
        details.gasPrice = { error: err.message, assumedValid: true };
      }
    }

    if (conditions.minFeeGainPercent !== undefined) {
      const thresholds = GAS_PRICE_THRESHOLDS[intent?.dest_chain || 'arbitrum'];
      let estimatedGain = 0.5;

      try {
        const destGas = await clearNodeClient.getGasPrice(intent?.dest_chain || 'arbitrum');
        const destGwei = parseFloat(destGas.gasPriceGwei || '0');

        if (destGwei <= thresholds.low) {
          estimatedGain = 1.5;
        } else if (destGwei <= thresholds.medium) {
          estimatedGain = 0.8;
        } else {
          estimatedGain = 0.3;
        }
      } catch (err) {
        console.warn('[Yellow] Fee gain estimation failed:', err.message);
      }

      details.feeGain = {
        estimated: estimatedGain,
        required: conditions.minFeeGainPercent,
        valid: estimatedGain >= conditions.minFeeGainPercent,
      };

      if (estimatedGain < conditions.minFeeGainPercent) {
        allValid = false;
        console.log(`[Yellow] Fee gain condition failed: ${estimatedGain}% < required ${conditions.minFeeGainPercent}%`);
      }
    }

    if (conditions.minAmountUsd !== undefined) {
      const amount = parseFloat(intent?.amount || '0');
      const meetsMinimum = amount >= parseFloat(conditions.minAmountUsd);
      details.minAmount = {
        actual: amount,
        required: parseFloat(conditions.minAmountUsd),
        valid: meetsMinimum,
      };

      if (!meetsMinimum) {
        allValid = false;
      }
    }

    if (conditions.timeWindow !== undefined) {
      const now = Date.now();
      const start = conditions.timeWindow.start ? new Date(conditions.timeWindow.start).getTime() : 0;
      const end = conditions.timeWindow.end ? new Date(conditions.timeWindow.end).getTime() : Infinity;
      const inWindow = now >= start && now <= end;
      details.timeWindow = {
        now: new Date(now).toISOString(),
        start: conditions.timeWindow.start || 'any',
        end: conditions.timeWindow.end || 'any',
        valid: inWindow,
      };

      if (!inWindow) {
        allValid = false;
      }
    }

    return { valid: allValid, details };
  },

  getBufferAnalytics: async () => {
    const buffered = await intentService.getBufferedIntents();
    const pending = await intentService.getPendingIntents();

    return {
      pendingCount: pending.length,
      bufferedCount: buffered.length,
      batches: [...new Set(buffered.map(i => i.yellow_batch_id))],
      oldestBuffered: buffered.length > 0 ? buffered[0].buffered_at : null,
      mode: yellowNetworkService.getMode(),
      testnet: USE_TESTNET,
      clearNode: clearNodeClient.getStatus(),
      activeSessions: activeSessions.size,
    };
  },

  getClearNodeConfig: async () => {
    const isLive = await ensureConnected();
    if (!isLive) {
      return { error: 'Not connected to ClearNode', mode: 'local_batching' };
    }

    try {
      const configMsg = await createGetConfigMessage();
      const response = await clearNodeClient.sendRequest(configMsg);
      return { success: true, config: response };
    } catch (err) {
      return { error: err.message };
    }
  },

  getLedgerBalances: async () => {
    const isLive = await ensureConnected();
    if (!isLive) {
      return { error: 'Not connected to ClearNode', mode: 'local_batching' };
    }

    try {
      const balancesMsg = await createGetLedgerBalancesMessage();
      const response = await clearNodeClient.sendRequest(balancesMsg);
      return { success: true, balances: response };
    } catch (err) {
      return { error: err.message };
    }
  },

  getGasPrices: async () => {
    try {
      if (!clearNodeClient.account) {
        clearNodeClient._initWallet();
      }
      return await clearNodeClient.getGasPrices();
    } catch (err) {
      return { error: err.message };
    }
  },
};
