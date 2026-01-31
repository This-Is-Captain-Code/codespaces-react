import axios from 'axios';

const OPENCLAW_GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL;
const OPENCLAW_GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN;

const openclawClient = axios.create({
  timeout: 30000,
});

export const openclawService = {
  getClient: () => {
    const gatewayUrl = OPENCLAW_GATEWAY_URL || process.env.OPENCLAW_GATEWAY_URL;
    const token = OPENCLAW_GATEWAY_TOKEN || process.env.OPENCLAW_GATEWAY_TOKEN;
    
    return {
      gatewayUrl,
      token,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    };
  },

  createAgent: async (agentData) => {
    const { gatewayUrl, headers } = openclawService.getClient();
    
    if (!gatewayUrl) {
      throw new Error('OPENCLAW_GATEWAY_URL not configured');
    }

    try {
      const response = await openclawClient.post(
        `${gatewayUrl}/v1/agents`,
        {
          name: agentData.name,
          system_prompt: agentData.systemPrompt || '',
          tools: agentData.tools || [],
        },
        { headers }
      );

      return response.data;
    } catch (error) {
      console.error('OpenClaw create agent error:', error.response?.data || error.message);
      throw new Error(`Failed to create agent in OpenClaw: ${error.response?.data?.error || error.message}`);
    }
  },

  getAgent: async (agentId) => {
    const { gatewayUrl, headers } = openclawService.getClient();
    
    if (!gatewayUrl) {
      throw new Error('OPENCLAW_GATEWAY_URL not configured');
    }

    try {
      const response = await openclawClient.get(
        `${gatewayUrl}/v1/agents/${agentId}`,
        { headers }
      );

      return response.data;
    } catch (error) {
      console.error('OpenClaw get agent error:', error.response?.data || error.message);
      throw new Error(`Failed to get agent: ${error.response?.data?.error || error.message}`);
    }
  },

  listAgents: async () => {
    const { gatewayUrl, headers } = openclawService.getClient();
    
    if (!gatewayUrl) {
      throw new Error('OPENCLAW_GATEWAY_URL not configured');
    }

    try {
      const response = await openclawClient.get(
        `${gatewayUrl}/v1/agents`,
        { headers }
      );

      return response.data;
    } catch (error) {
      console.error('OpenClaw list agents error:', error.response?.data || error.message);
      throw new Error(`Failed to list agents: ${error.response?.data?.error || error.message}`);
    }
  },

  deleteAgent: async (agentId) => {
    const { gatewayUrl, headers } = openclawService.getClient();
    
    if (!gatewayUrl) {
      throw new Error('OPENCLAW_GATEWAY_URL not configured');
    }

    try {
      const response = await openclawClient.delete(
        `${gatewayUrl}/v1/agents/${agentId}`,
        { headers }
      );

      return response.data;
    } catch (error) {
      console.error('OpenClaw delete agent error:', error.response?.data || error.message);
      throw new Error(`Failed to delete agent: ${error.response?.data?.error || error.message}`);
    }
  },

  createSession: async (agentId) => {
    const { gatewayUrl, headers } = openclawService.getClient();
    
    if (!gatewayUrl) {
      throw new Error('OPENCLAW_GATEWAY_URL not configured');
    }

    try {
      const response = await openclawClient.post(
        `${gatewayUrl}/v1/agents/${agentId}/sessions`,
        {},
        { headers }
      );

      return response.data;
    } catch (error) {
      console.error('OpenClaw create session error:', error.response?.data || error.message);
      throw new Error(`Failed to create session: ${error.response?.data?.error || error.message}`);
    }
  },

  sendMessage: async (agentId, sessionId, message) => {
    const { gatewayUrl, headers } = openclawService.getClient();
    
    if (!gatewayUrl) {
      throw new Error('OPENCLAW_GATEWAY_URL not configured');
    }

    try {
      const response = await openclawClient.post(
        `${gatewayUrl}/v1/agents/${agentId}/sessions/${sessionId}/messages`,
        { content: message },
        { headers }
      );

      return response.data;
    } catch (error) {
      console.error('OpenClaw send message error:', error.response?.data || error.message);
      throw new Error(`Failed to send message: ${error.response?.data?.error || error.message}`);
    }
  },

  getMessages: async (agentId, sessionId) => {
    const { gatewayUrl, headers } = openclawService.getClient();
    
    if (!gatewayUrl) {
      throw new Error('OPENCLAW_GATEWAY_URL not configured');
    }

    try {
      const response = await openclawClient.get(
        `${gatewayUrl}/v1/agents/${agentId}/sessions/${sessionId}/messages`,
        { headers }
      );

      return response.data;
    } catch (error) {
      console.error('OpenClaw get messages error:', error.response?.data || error.message);
      throw new Error(`Failed to get messages: ${error.response?.data?.error || error.message}`);
    }
  },

  healthCheck: async () => {
    const { gatewayUrl, headers } = openclawService.getClient();
    
    if (!gatewayUrl) {
      return { healthy: false, error: 'OPENCLAW_GATEWAY_URL not configured' };
    }

    try {
      const response = await openclawClient.get(`${gatewayUrl}/health`, { headers });
      return { healthy: true, ...response.data };
    } catch (error) {
      console.error('OpenClaw health check error:', error.message);
      return { healthy: false, error: error.message };
    }
  },
};
