import { gatewayService } from './gatewayService.js';
import { flyService } from './flyService.js';

export const openclawService = {
  createAgent: async (gatewayId, agentConfig) => {
    const { agentId, model, systemPrompt, botName } = agentConfig;
    
    const gateway = await gatewayService.getGateway(gatewayId);
    if (!gateway) {
      throw new Error(`Gateway ${gatewayId} not found`);
    }

    console.log(`Registering agent ${agentId} on gateway ${gatewayId}...`);

    const workspaceDir = `/data/agents/${agentId}/workspace`;
    const agentDir = `/data/agents/${agentId}/agent`;
    const openrouterModel = model.startsWith('openrouter/') ? model : `openrouter/${model}`;

    const sessionsDir = `/data/agents/${agentId}/sessions`;
    const setupCommands = [
      `mkdir -p ${workspaceDir} ${agentDir} ${sessionsDir}`,
      `chown -R node:node /data/agents/${agentId}`,
      `chmod -R 755 /data/agents/${agentId}`,
      `echo '{"openrouter":{"provider":"openrouter","mode":"key","apiKey":"'$OPENROUTER_API_KEY'"}}' > ${agentDir}/auth-profiles.json`,
    ];

    const agentsAddCmd = [
      `node dist/index.js agents add ${agentId}`,
      `--workspace ${workspaceDir}`,
      `--agent-dir ${agentDir}`,
      `--model ${openrouterModel}`,
      `--non-interactive`,
    ].join(' ');

    const fullCommand = [...setupCommands, agentsAddCmd].join(' && ');

    try {
      const result = await flyService.execOnGateway(gatewayId, fullCommand, 60000);
      console.log(`Agent ${agentId} registered successfully:`, result);
      
      // Restart gateway to reload config with new agent
      console.log(`Restarting gateway to load new agent configuration...`);
      await flyService.restartGateway(gatewayId);
      console.log(`Gateway restarted, agent ${agentId} is now active`);
    } catch (error) {
      console.error(`Failed to register agent ${agentId}:`, error.message);
      throw new Error(`Failed to register agent on gateway: ${error.message}`);
    }

    await gatewayService.incrementAgentCount(gatewayId);

    const accessUrl = `${gateway.endpoint}/?token=${gateway.gateway_token}&agent=${agentId}`;
    
    return {
      agentId,
      gatewayId,
      endpoint: gateway.endpoint,
      gatewayToken: gateway.gateway_token,
      controlUrl: accessUrl,
      model: openrouterModel,
      botName,
    };
  },

  deleteAgent: async (gatewayId, agentId) => {
    const gateway = await gatewayService.getGateway(gatewayId);
    if (!gateway) {
      throw new Error(`Gateway ${gatewayId} not found`);
    }

    console.log(`Removing agent ${agentId} from gateway ${gatewayId}...`);

    try {
      const removeCmd = `rm -rf /data/agents/${agentId} && node dist/index.js config unset agents.isolated.${agentId}`;
      await flyService.execOnGateway(gatewayId, removeCmd, 30000);
      console.log(`Agent ${agentId} removed from gateway`);
    } catch (error) {
      console.warn(`Failed to remove agent ${agentId} from gateway: ${error.message}`);
    }

    await gatewayService.decrementAgentCount(gatewayId);

    return true;
  },

  listAgents: async (gatewayId) => {
    const gateway = await gatewayService.getGateway(gatewayId);
    if (!gateway) {
      throw new Error(`Gateway ${gatewayId} not found`);
    }

    try {
      const result = await flyService.execOnGateway(gatewayId, 'node dist/index.js agents list --json', 30000);
      return JSON.parse(result.stdout || '[]');
    } catch (error) {
      console.error(`Failed to list agents: ${error.message}`);
      return [];
    }
  },

  getAgentAccessUrl: (gateway, agentId) => {
    return `${gateway.endpoint}/?token=${gateway.gateway_token}&agent=${agentId}`;
  },

  sendMessage: async (gateway, agentId, message, sessionId = 'main') => {
    const endpoint = `${gateway.endpoint}/v1/chat/completions`;
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${gateway.gateway_token}`,
        'Content-Type': 'application/json',
        'X-OpenClaw-Agent': agentId,
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: message }],
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenClaw API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || 'No response';
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
