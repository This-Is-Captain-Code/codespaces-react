// Example API usage and debugging

// 1. Set auth token (from Privy or login)
import { setAuthToken } from './src/api/client';
setAuthToken('your-user-id-or-token');

// 2. Create an agent
import { agentAPI } from './src/api/client';
const agent = await agentAPI.create('My Agent', 'You are helpful.');

// 3. Start the agent
await agentAPI.start(agent.id);

// 4. Send a message
import { chatAPI } from './src/api/client';
const response = await chatAPI.sendMessage(
  agent.id,
  'What is 2+2?',
  'openai/gpt-3.5-turbo',
  []
);

// 5. Check credits
import { billingAPI } from './src/api/client';
const balance = await billingAPI.getBalance();

// 6. Add credits
await billingAPI.addCredits(500); // $5
