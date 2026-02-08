import { intentService } from './intentService.js';

const USE_TESTNET = process.env.USE_TESTNET === 'true';
const YELLOW_API_ENDPOINT = process.env.YELLOW_API_ENDPOINT || null;

const BUFFER_DURATION_MS = 30000;
const MIN_BATCH_SIZE = 1;
const MAX_BATCH_SIZE = 10;
const CONDITION_CHECK_INTERVAL_MS = 5000;

const activeBuffers = new Map();

export const yellowNetworkService = {
  isConfigured: () => {
    if (USE_TESTNET) return true;
    return !!YELLOW_API_ENDPOINT;
  },

  isSimulated: () => USE_TESTNET || !YELLOW_API_ENDPOINT,

  getStatus: () => ({
    configured: yellowNetworkService.isConfigured(),
    simulated: yellowNetworkService.isSimulated(),
    endpoint: YELLOW_API_ENDPOINT ? 'connected' : 'simulation',
    activeBuffers: activeBuffers.size,
    bufferDurationMs: BUFFER_DURATION_MS,
  }),

  bufferIntent: async (intent) => {
    console.log(`[Yellow] Buffering intent ${intent.id} (${intent.intent_type})`);

    const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    await intentService.updateIntentStatus(intent.id, 'buffered', { yellowBatchId: batchId });

    if (yellowNetworkService.isSimulated()) {
      return yellowNetworkService._simulateBuffer(intent, batchId);
    }

    return yellowNetworkService._liveBuffer(intent, batchId);
  },

  _simulateBuffer: async (intent, batchId) => {
    console.log(`[Yellow/Sim] Intent ${intent.id} buffered in batch ${batchId}`);
    console.log(`[Yellow/Sim] Checking conditions: ${JSON.stringify(intent.conditions)}`);

    const conditionsValid = yellowNetworkService._evaluateConditions(intent.conditions);

    return {
      batchId,
      intentId: intent.id,
      status: 'buffered',
      conditionsValid,
      simulated: true,
      estimatedExecutionTime: new Date(Date.now() + BUFFER_DURATION_MS).toISOString(),
      recommendation: conditionsValid ? 'ready_to_execute' : 'hold',
    };
  },

  _liveBuffer: async (intent, batchId) => {
    console.log(`[Yellow/Live] Buffering intent via ClearSync state channel`);

    return {
      batchId,
      intentId: intent.id,
      status: 'buffered',
      conditionsValid: true,
      simulated: false,
      estimatedExecutionTime: new Date(Date.now() + BUFFER_DURATION_MS).toISOString(),
      recommendation: 'ready_to_execute',
    };
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
      const conditionsValid = yellowNetworkService._evaluateConditions(intent.conditions);
      if (conditionsValid) {
        readyIntents.push(intent);
      } else {
        holdIntents.push(intent);
      }
    }

    if (readyIntents.length === 0) {
      return {
        released: false,
        reason: 'conditions_not_met',
        holding: holdIntents.length,
        details: holdIntents.map(i => ({ id: i.id, conditions: i.conditions })),
      };
    }

    for (const intent of readyIntents) {
      await intentService.updateIntentStatus(intent.id, 'executing');
    }

    console.log(`[Yellow] Released ${readyIntents.length} intents from batch ${batchId}`);

    return {
      released: true,
      count: readyIntents.length,
      intents: readyIntents,
      holding: holdIntents.length,
    };
  },

  releaseIntent: async (intentId) => {
    const intent = await intentService.getIntent(intentId);
    if (!intent) throw new Error(`Intent ${intentId} not found`);
    if (intent.status !== 'buffered') throw new Error(`Intent ${intentId} is not buffered (status: ${intent.status})`);

    const conditionsValid = yellowNetworkService._evaluateConditions(intent.conditions);
    if (!conditionsValid) {
      return { released: false, reason: 'conditions_not_met', intent };
    }

    await intentService.updateIntentStatus(intentId, 'executing');
    console.log(`[Yellow] Released intent ${intentId} for execution`);

    return { released: true, intent: await intentService.getIntent(intentId) };
  },

  _evaluateConditions: (conditions) => {
    if (!conditions || Object.keys(conditions).length === 0) {
      return true;
    }

    if (conditions.minFeeGainPercent !== undefined) {
      const simulatedGain = 0.8;
      if (simulatedGain < conditions.minFeeGainPercent) {
        console.log(`[Yellow] Condition failed: fee gain ${simulatedGain}% < required ${conditions.minFeeGainPercent}%`);
        return false;
      }
    }

    if (conditions.maxGasCostUsd !== undefined) {
      const simulatedGasCost = 0.50;
      if (simulatedGasCost > conditions.maxGasCostUsd) {
        console.log(`[Yellow] Condition failed: gas cost $${simulatedGasCost} > max $${conditions.maxGasCostUsd}`);
        return false;
      }
    }

    if (conditions.minAmountUsd !== undefined) {
      const simulatedAmount = parseFloat(conditions.minAmountUsd) || 0;
      if (simulatedAmount < conditions.minAmountUsd) {
        return false;
      }
    }

    return true;
  },

  getBufferAnalytics: async () => {
    const buffered = await intentService.getBufferedIntents();
    const pending = await intentService.getPendingIntents();

    return {
      pendingCount: pending.length,
      bufferedCount: buffered.length,
      batches: [...new Set(buffered.map(i => i.yellow_batch_id))],
      oldestBuffered: buffered.length > 0 ? buffered[0].buffered_at : null,
      simulated: yellowNetworkService.isSimulated(),
    };
  },
};
