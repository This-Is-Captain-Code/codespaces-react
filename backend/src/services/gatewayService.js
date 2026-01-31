import { db } from '../db/index.js';
import { flyService } from './flyService.js';
import crypto from 'crypto';

export const gatewayService = {
  createGateway: async (gatewayId, options = {}) => {
    const {
      region = 'iad',
      memoryMb = 4096,
      maxAgents = 200,
    } = options;

    const setupPassword = crypto.randomBytes(16).toString('hex');
    const gatewayToken = crypto.randomBytes(32).toString('hex');

    const flyResult = await flyService.createOpenClawGateway(gatewayId, {
      setupPassword,
      gatewayToken,
      region,
      memoryMb,
      cpus: 2,
    });

    await db.query(`
      INSERT INTO gateways (id, fly_app_name, fly_machine_id, fly_volume_id, endpoint, setup_password, gateway_token, region, memory_mb, max_agents, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'running')
    `, [
      gatewayId,
      flyResult.appName,
      flyResult.machineId,
      flyResult.volumeId,
      flyResult.endpoint,
      setupPassword,
      gatewayToken,
      region,
      memoryMb,
      maxAgents,
    ]);

    return {
      id: gatewayId,
      endpoint: flyResult.endpoint,
      setupUrl: flyResult.setupUrl,
      controlUrl: flyResult.controlUrl,
      region,
    };
  },

  saveExistingGateway: async (gatewayId, flyResult, setupPassword, gatewayToken, options = {}) => {
    const { region = 'iad', memoryMb = 4096, maxAgents = 200 } = options;

    await db.query(`
      INSERT INTO gateways (id, fly_app_name, fly_machine_id, fly_volume_id, endpoint, setup_password, gateway_token, region, memory_mb, max_agents, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'running')
      ON CONFLICT (id) DO UPDATE SET
        fly_app_name = EXCLUDED.fly_app_name,
        fly_machine_id = EXCLUDED.fly_machine_id,
        fly_volume_id = EXCLUDED.fly_volume_id,
        endpoint = EXCLUDED.endpoint,
        setup_password = EXCLUDED.setup_password,
        gateway_token = EXCLUDED.gateway_token,
        updated_at = CURRENT_TIMESTAMP
    `, [
      gatewayId,
      flyResult.appName,
      flyResult.machineId,
      flyResult.volumeId,
      flyResult.endpoint,
      setupPassword,
      gatewayToken,
      region,
      memoryMb,
      maxAgents,
    ]);

    return { id: gatewayId, endpoint: flyResult.endpoint };
  },

  getGateway: async (gatewayId) => {
    const result = await db.query(`SELECT * FROM gateways WHERE id = $1`, [gatewayId]);
    return result.rows[0] || null;
  },

  getAvailableGateway: async () => {
    const result = await db.query(`
      SELECT * FROM gateways 
      WHERE status = 'running' AND current_agents < max_agents
      ORDER BY current_agents ASC
      LIMIT 1
    `);
    return result.rows[0] || null;
  },

  getAllGateways: async () => {
    const result = await db.query(`SELECT * FROM gateways ORDER BY created_at DESC`);
    return result.rows;
  },

  incrementAgentCount: async (gatewayId) => {
    await db.query(`
      UPDATE gateways SET current_agents = current_agents + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [gatewayId]);
  },

  decrementAgentCount: async (gatewayId) => {
    await db.query(`
      UPDATE gateways SET current_agents = GREATEST(0, current_agents - 1), updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [gatewayId]);
  },

  deleteGateway: async (gatewayId) => {
    await flyService.deleteOpenClawGateway(gatewayId);
    await db.query(`DELETE FROM gateways WHERE id = $1`, [gatewayId]);
    return true;
  },

  getGatewayStatus: async (gatewayId) => {
    const gateway = await gatewayService.getGateway(gatewayId);
    if (!gateway) {
      return { status: 'not_found' };
    }

    const flyStatus = await flyService.getGatewayStatus(gatewayId);
    return {
      ...gateway,
      flyStatus: flyStatus.status,
    };
  },
};
