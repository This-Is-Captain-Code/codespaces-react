// In-memory storage for credits (replace with database)
const userCredits = new Map();

// Pricing per 1M tokens (in cents)
const PRICING = {
  'openai/gpt-4-turbo-preview': {
    input: 1.5,
    output: 4.5,
  },
  'openai/gpt-3.5-turbo': {
    input: 0.05,
    output: 0.15,
  },
  'anthropic/claude-3-opus': {
    input: 1.5,
    output: 7.5,
  },
  'anthropic/claude-3-sonnet': {
    input: 0.3,
    output: 1.5,
  },
  'meta-llama/llama-2-70b-chat': {
    input: 0.2,
    output: 0.4,
  },
};

export const billingService = {
  // Get user credits
  getCredits: async (userId) => {
    return userCredits.get(userId) || { userId, balance: 0, totalSpent: 0 };
  },

  // Add credits
  addCredits: async (userId, amount) => {
    const credits = userCredits.get(userId) || { userId, balance: 0, totalSpent: 0 };
    credits.balance += amount;
    userCredits.set(userId, credits);
    return credits;
  },

  // Calculate token cost
  calculateCost: (model, promptTokens, completionTokens) => {
    const pricing = PRICING[model] || PRICING['openai/gpt-3.5-turbo'];
    
    const inputCost = (promptTokens / 1_000_000) * pricing.input;
    const outputCost = (completionTokens / 1_000_000) * pricing.output;
    
    return {
      inputCost,
      outputCost,
      totalCost: inputCost + outputCost,
    };
  },

  // Deduct credits
  deductCredits: async (userId, amount) => {
    const credits = userCredits.get(userId) || { userId, balance: 0, totalSpent: 0 };
    
    if (credits.balance < amount) {
      throw new Error('Insufficient credits');
    }

    credits.balance -= amount;
    credits.totalSpent += amount;
    userCredits.set(userId, credits);

    return credits;
  },

  // Pre-authorize spending
  preAuthorize: async (userId, estimatedCost) => {
    const credits = userCredits.get(userId) || { userId, balance: 0, totalSpent: 0 };
    
    if (credits.balance < estimatedCost) {
      throw new Error('Insufficient credits for this request');
    }

    return true;
  },
};
