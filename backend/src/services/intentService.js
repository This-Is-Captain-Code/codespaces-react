import { db } from '../db/index.js';

const INTENT_TYPES = ['MOVE_LIQUIDITY', 'DEPLOY_CAPITAL', 'REBALANCE', 'WITHDRAW'];
const INTENT_STATUSES = ['pending', 'buffered', 'executing', 'completed', 'failed', 'cancelled'];

export const intentService = {
  getIntentTypes: () => INTENT_TYPES,
  getIntentStatuses: () => INTENT_STATUSES,

  createIntent: async ({ botId, intentType, sourceChain, destChain, tokenAddress, tokenSymbol, amount, conditions = {}, executionParams = {} }) => {
    if (!INTENT_TYPES.includes(intentType)) {
      throw new Error(`Invalid intent type: ${intentType}. Must be one of: ${INTENT_TYPES.join(', ')}`);
    }

    const result = await db.query(
      `INSERT INTO liquidity_intents (bot_id, intent_type, source_chain, dest_chain, token_address, token_symbol, amount, conditions, execution_params)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [botId, intentType, sourceChain, destChain, tokenAddress, tokenSymbol, amount, JSON.stringify(conditions), JSON.stringify(executionParams)]
    );
    return result.rows[0];
  },

  getIntent: async (intentId) => {
    const result = await db.query('SELECT * FROM liquidity_intents WHERE id = $1', [intentId]);
    return result.rows[0] || null;
  },

  getIntentsByBot: async (botId, status = null) => {
    let query = 'SELECT * FROM liquidity_intents WHERE bot_id = $1';
    const params = [botId];
    if (status) {
      query += ' AND status = $2';
      params.push(status);
    }
    query += ' ORDER BY created_at DESC';
    const result = await db.query(query, params);
    return result.rows;
  },

  getPendingIntents: async () => {
    const result = await db.query(
      "SELECT * FROM liquidity_intents WHERE status = 'pending' ORDER BY created_at ASC"
    );
    return result.rows;
  },

  getBufferedIntents: async () => {
    const result = await db.query(
      "SELECT * FROM liquidity_intents WHERE status = 'buffered' ORDER BY buffered_at ASC"
    );
    return result.rows;
  },

  updateIntentStatus: async (intentId, status, extra = {}) => {
    if (!INTENT_STATUSES.includes(status)) {
      throw new Error(`Invalid status: ${status}`);
    }

    const setClauses = ['status = $2', 'updated_at = CURRENT_TIMESTAMP'];
    const params = [intentId, status];
    let paramIdx = 3;

    if (status === 'buffered') {
      setClauses.push('buffered_at = CURRENT_TIMESTAMP');
    } else if (status === 'executing') {
      setClauses.push('executed_at = CURRENT_TIMESTAMP');
    } else if (status === 'completed') {
      setClauses.push('completed_at = CURRENT_TIMESTAMP');
    }

    if (extra.yellowBatchId) {
      setClauses.push(`yellow_batch_id = $${paramIdx}`);
      params.push(extra.yellowBatchId);
      paramIdx++;
    }
    if (extra.lifiRouteId) {
      setClauses.push(`lifi_route_id = $${paramIdx}`);
      params.push(extra.lifiRouteId);
      paramIdx++;
    }
    if (extra.poolAddress) {
      setClauses.push(`pool_address = $${paramIdx}`);
      params.push(extra.poolAddress);
      paramIdx++;
    }
    if (extra.hookAddress) {
      setClauses.push(`hook_address = $${paramIdx}`);
      params.push(extra.hookAddress);
      paramIdx++;
    }
    if (extra.errorMessage) {
      setClauses.push(`error_message = $${paramIdx}`);
      params.push(extra.errorMessage);
      paramIdx++;
    }
    if (extra.executionParams) {
      setClauses.push(`execution_params = $${paramIdx}`);
      params.push(JSON.stringify(extra.executionParams));
      paramIdx++;
    }

    const result = await db.query(
      `UPDATE liquidity_intents SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`,
      params
    );
    return result.rows[0];
  },

  cancelIntent: async (intentId) => {
    return intentService.updateIntentStatus(intentId, 'cancelled');
  },

  getRecentIntents: async (limit = 20) => {
    const result = await db.query(
      `SELECT li.*, ccm.tx_hash_source, ccm.tx_hash_dest 
       FROM liquidity_intents li 
       LEFT JOIN cross_chain_movements ccm ON ccm.intent_id = li.id 
       ORDER BY li.created_at DESC LIMIT $1`,
      [limit]
    );
    return result.rows;
  },
};
