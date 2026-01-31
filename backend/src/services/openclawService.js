import axios from 'axios';

export const openclawService = {
  // Create agent inside OpenClaw gateway
  createAgent: async (gatewayUrl, runtimeToken, agentData) => {
    try {
      const response = await axios.post(
        `${gatewayUrl}/v1/agents`,
        {
          name: agentData.name,
          system_prompt: agentData.systemPrompt || '',
          tools: agentData.tools || [],
        },
        {
          headers: {
            'Authorization': `Bearer ${runtimeToken}`,
          },
        }
      );

      return response.data;
    } catch (error) {
      console.error('OpenClaw create agent error:', error.response?.data || error.message);
      throw new Error(`Failed to create agent in OpenClaw: ${error.message}`);
    }
  },

  // Create session in OpenClaw
  createSession: async (gatewayUrl, runtimeToken, openclawAgentId) => {
    try {
      const response = await axios.post(
        `${gatewayUrl}/v1/agents/${openclawAgentId}/sessions`,
        {},
        {
          headers: {
            'Authorization': `Bearer ${runtimeToken}`,
          },
        }
      );

      return response.data;
    } catch (error) {
      console.error('OpenClaw create session error:', error.response?.data || error.message);
      throw new Error(`Failed to create session: ${error.message}`);
    }
  },

  // Send message to OpenClaw session
  sendMessage: async (gatewayUrl, runtimeToken, openclawAgentId, sessionId, message) => {
    try {
      const response = await axios.post(
        `${gatewayUrl}/v1/agents/${openclawAgentId}/sessions/${sessionId}/messages`,
        {
          content: message,
        },
        {
          headers: {
            'Authorization': `Bearer ${runtimeToken}`,
          },
        }
      );

      return response.data;
    } catch (error) {
      console.error('OpenClaw send message error:', error.response?.data || error.message);
      throw new Error(`Failed to send message: ${error.message}`);
    }
  },

  // Get session messages
  getMessages: async (gatewayUrl, runtimeToken, openclawAgentId, sessionId) => {
    try {
      const response = await axios.get(
        `${gatewayUrl}/v1/agents/${openclawAgentId}/sessions/${sessionId}/messages`,
        {
          headers: {
            'Authorization': `Bearer ${runtimeToken}`,
          },
        }
      );

      return response.data;
    } catch (error) {
      console.error('OpenClaw get messages error:', error.response?.data || error.message);
      throw new Error(`Failed to get messages: ${error.message}`);
    }
  },

  // Health check
  healthCheck: async (gatewayUrl, runtimeToken) => {
    try {
      const response = await axios.get(`${gatewayUrl}/health`, {
        headers: {
          'Authorization': `Bearer ${runtimeToken}`,
        },
      });

      return response.data;
    } catch (error) {
      console.error('OpenClaw health check error:', error.message);
      return { healthy: false, error: error.message };
    }
  },
};
