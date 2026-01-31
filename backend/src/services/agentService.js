import { v4 as uuidv4 } from 'uuid';
import { dockerService } from './dockerService.js';
import { openclawService } from './openclawService.js';
import crypto from 'crypto';

// In-memory storage (replace with database)
const agents = new Map();
const userAgents = new Map();
const runtimePorts = new Map();

// Store runtime tokens separately (for OpenClaw gateway communication)
const runtimeTokens = new Map();

export const agentService = {
  // Create a new agent
  createAgent: async (userId, data) => {
    const agentId = uuidv4();
    const agent = {
      id: agentId,
      userId,
      name: data.name,
      systemPrompt: data.systemPrompt || '',
      state: 'stopped',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      runtimeId: null,
      runtimeToken: null,
    };

    agents.set(agentId, agent);
    
    if (!userAgents.has(userId)) {
      userAgents.set(userId, []);
    }
    userAgents.get(userId).push(agentId);

    return agent;
  },

  // Get all agents for a user
  getAgents: async (userId) => {
    const agentIds = userAgents.get(userId) || [];
    return agentIds.map(id => agents.get(id));
  },

  // Get a single agent
  getAgent: async (agentId) => {
    return agents.get(agentId);
  },

  // Start an agent
  startAgent: async (agentId, userId) => {
    const agent = agents.get(agentId);
    
    if (!agent) {
      throw new Error('Agent not found');
    }

    if (agent.userId !== userId) {
      throw new Error('Unauthorized');
    }

    if (agent.state !== 'stopped') {
      throw new Error(`Agent is ${agent.state}, cannot start`);
    }

    try {
      // Generate runtime credentials
      const runtimeId = uuidv4();
      const runtimeToken = crypto.randomBytes(32).toString('hex');
      
      // Hash tokens for storage
      const tokenHash = crypto.createHash('sha256').update(runtimeToken).digest('hex');
      const idHash = crypto.createHash('sha256').update(runtimeId).digest('hex');

      // Step 1: Launch Docker container
      console.log(`Launching Docker container for agent ${agentId}...`);
      const containerInfo = await dockerService.launchContainer(agentId, runtimeToken, runtimeId);
      
      // Step 2: Wait for container to be ready
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Step 3: Create OpenClaw gateway URL
      const gatewayUrl = `http://127.0.0.1:${containerInfo.port}`;

      // Step 4: Health check
      console.log(`Checking gateway health at ${gatewayUrl}...`);
      const health = await openclawService.healthCheck(gatewayUrl, runtimeToken);
      if (!health.healthy) {
        throw new Error('Gateway health check failed');
      }

      // Step 5: Create agent inside OpenClaw
      console.log(`Creating agent in OpenClaw...`);
      const openclawAgent = await openclawService.createAgent(
        gatewayUrl,
        runtimeToken,
        {
          name: agent.name,
          systemPrompt: agent.systemPrompt,
          tools: [],
        }
      );

      // Store runtime info
      agent.runtimeId = runtimeId;
      agent.runtimeIdHash = idHash;
      agent.runtimeTokenHash = tokenHash;
      agent.state = 'running';
      agent.updatedAt = new Date().toISOString();
      agent.containerInfo = containerInfo;
      agent.gatewayUrl = gatewayUrl;
      agent.openclawAgentId = openclawAgent.id;
      agent.sessionId = null; // Will be created on first message

      agents.set(agentId, agent);
      runtimePorts.set(agentId, containerInfo.port);
      runtimeTokens.set(agentId, runtimeToken); // Store token for gateway communication

      console.log(`Agent ${agentId} started successfully`);
      return agent;
    } catch (error) {
      console.error(`Failed to start agent: ${error.message}`);
      agent.state = 'errored';
      agent.error = error.message;
      agents.set(agentId, agent);
      throw error;
    }
  },

  // Stop an agent
  stopAgent: async (agentId, userId) => {
    const agent = agents.get(agentId);
    
    if (!agent) {
      throw new Error('Agent not found');
    }

    if (agent.userId !== userId) {
      throw new Error('Unauthorized');
    }

    try {
      // Stop Docker container (preserve volume)
      if (agent.containerInfo) {
        await dockerService.stopContainer(agentId);
      }

      agent.state = 'stopped';
      agent.updatedAt = new Date().toISOString();
      agent.containerInfo = null;
      agent.gatewayUrl = null;

      agents.set(agentId, agent);
      return agent;
    } catch (error) {
      console.error(`Failed to stop agent: ${error.message}`);
      throw error;
    }
  },

  // Delete an agent
  deleteAgent: async (agentId, userId) => {
    const agent = agents.get(agentId);
    
    if (!agent) {
      throw new Error('Agent not found');
    }

    if (agent.userId !== userId) {
      throw new Error('Unauthorized');
    }

    if (agent.state === 'running') {
      throw new Error('Cannot delete running agent');
    }

    try {
      // Clean up container if exists
      if (agent.containerInfo) {
        await dockerService.removeContainer(agentId);
      }

      agents.delete(agentId);
      const userAgentList = userAgents.get(userId) || [];
      userAgents.set(userId, userAgentList.filter(id => id !== agentId));
      runtimePorts.delete(agentId);

      return { success: true };
    } catch (error) {
      console.error(`Failed to delete agent: ${error.message}`);
      throw error;
    }
  },

  // Update agent
  updateAgent: async (agentId, userId, data) => {
    const agent = agents.get(agentId);
    
    if (!agent) {
      throw new Error('Agent not found');
    }

    if (agent.userId !== userId) {
      throw new Error('Unauthorized');
    }

    if (data.name) agent.name = data.name;
    if (data.systemPrompt) agent.systemPrompt = data.systemPrompt;
    
    agent.updatedAt = new Date().toISOString();
    agents.set(agentId, agent);

    return agent;
  },

  // Get runtime token (for internal use)
  getRuntimeToken: (agentId) => {
    return runtimeTokens.get(agentId);
  },
};
