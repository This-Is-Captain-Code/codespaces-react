import { gatewayService } from './gatewayService.js';

export const openclawService = {
  createAgent: async (gatewayId, agentConfig) => {
    const { agentId, model, systemPrompt, botName } = agentConfig;
    
    const gateway = await gatewayService.getGateway(gatewayId);
    if (!gateway) {
      throw new Error(`Gateway ${gatewayId} not found`);
    }

    console.log(`Registering agent ${agentId} on gateway ${gatewayId}...`);

    await gatewayService.incrementAgentCount(gatewayId);

    const accessUrl = `${gateway.endpoint}/?token=${gateway.gateway_token}`;
    
    return {
      agentId,
      gatewayId,
      endpoint: gateway.endpoint,
      gatewayToken: gateway.gateway_token,
      controlUrl: accessUrl,
      model: model || 'openai/gpt-4o',
      botName,
    };
  },

  deleteAgent: async (gatewayId, agentId) => {
    const gateway = await gatewayService.getGateway(gatewayId);
    if (!gateway) {
      throw new Error(`Gateway ${gatewayId} not found`);
    }

    console.log(`Removing agent ${agentId} from gateway ${gatewayId}...`);

    await gatewayService.decrementAgentCount(gatewayId);

    return true;
  },

  getAgentAccessUrl: (gateway, agentId) => {
    return `${gateway.endpoint}/?token=${gateway.gateway_token}`;
  },

  healthCheck: async (gatewayId) => {
    const gateway = await gatewayService.getGateway(gatewayId);
    
    if (!gateway) {
      return { healthy: false, error: 'Gateway not found' };
    }

    try {
      const response = await fetch(`${gateway.endpoint}/`, {
        method: 'GET',
        headers: { 'Accept': 'text/html' },
        signal: AbortSignal.timeout(10000),
      });
      
      return { 
        healthy: response.ok, 
        status: response.status,
        endpoint: gateway.endpoint 
      };
    } catch (error) {
      console.error('OpenClaw health check error:', error.message);
      return { healthy: false, error: error.message };
    }
  },
};
