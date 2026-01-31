import express from 'express';
import { agentService } from '../services/agentService.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// Middleware to check auth
router.use(authMiddleware);

// Create agent
router.post('/', async (req, res, next) => {
  try {
    const { name, systemPrompt } = req.body;
    const userId = req.user.id;

    if (!name) {
      return res.status(400).json({ error: 'Agent name required' });
    }

    const agent = await agentService.createAgent(userId, {
      name,
      systemPrompt,
    });

    res.status(201).json(agent);
  } catch (error) {
    next(error);
  }
});

// Get all agents
router.get('/', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const agents = await agentService.getAgents(userId);
    res.json(agents);
  } catch (error) {
    next(error);
  }
});

// Get agent by ID
router.get('/:agentId', async (req, res, next) => {
  try {
    const { agentId } = req.params;
    const userId = req.user.id;
    const agent = await agentService.getAgent(agentId);

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    if (agent.userId !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    res.json(agent);
  } catch (error) {
    next(error);
  }
});

// Update agent
router.patch('/:agentId', async (req, res, next) => {
  try {
    const { agentId } = req.params;
    const userId = req.user.id;
    const { name, systemPrompt } = req.body;

    const agent = await agentService.updateAgent(agentId, userId, {
      name,
      systemPrompt,
    });

    res.json(agent);
  } catch (error) {
    next(error);
  }
});

// Start agent
router.post('/:agentId/start', async (req, res, next) => {
  try {
    const { agentId } = req.params;
    const userId = req.user.id;

    const agent = await agentService.startAgent(agentId, userId);
    res.json(agent);
  } catch (error) {
    next(error);
  }
});

// Stop agent
router.post('/:agentId/stop', async (req, res, next) => {
  try {
    const { agentId } = req.params;
    const userId = req.user.id;

    const agent = await agentService.stopAgent(agentId, userId);
    res.json(agent);
  } catch (error) {
    next(error);
  }
});

// Delete agent
router.delete('/:agentId', async (req, res, next) => {
  try {
    const { agentId } = req.params;
    const userId = req.user.id;

    await agentService.deleteAgent(agentId, userId);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
