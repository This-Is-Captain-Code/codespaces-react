import axios from 'axios';

export const openrouterService = {
  // Call OpenRouter API
  callModel: async (messages, options = {}) => {
    const {
      model = 'openai/gpt-4-turbo-preview',
      temperature = 0.7,
      maxTokens = 2000,
    } = options;

    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
    const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';

    if (!OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY not configured');
    }

    try {
      const response = await axios.post(
        `${OPENROUTER_BASE_URL}/chat/completions`,
        {
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
          stream: false,
        },
        {
          headers: {
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'HTTP-Referer': process.env.FRONTEND_URL || 'http://localhost:5173',
            'X-Title': 'MoltRack',
          },
        }
      );

      const usage = response.data.usage || {};
      return {
        content: response.data.choices[0]?.message?.content,
        usage: {
          promptTokens: usage.prompt_tokens || 0,
          completionTokens: usage.completion_tokens || 0,
          totalTokens: usage.total_tokens || 0,
        },
        model,
      };
    } catch (error) {
      console.error('OpenRouter API error:', error.response?.data || error.message);
      throw new Error(`OpenRouter API error: ${error.message}`);
    }
  },

  // Stream response from OpenRouter
  streamModel: async (messages, options = {}) => {
    const {
      model = 'openai/gpt-4-turbo-preview',
      temperature = 0.7,
      maxTokens = 2000,
    } = options;

    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
    const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';

    if (!OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY not configured');
    }

    return axios.post(
      `${OPENROUTER_BASE_URL}/chat/completions`,
      {
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: true,
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'HTTP-Referer': process.env.FRONTEND_URL || 'http://localhost:5173',
          'X-Title': 'MoltRack',
        },
        responseType: 'stream',
      }
    );
  },

  // Get available models
  getModels: async () => {
    // Popular models available on OpenRouter
    return [
      { id: 'openai/gpt-4-turbo-preview', name: 'GPT-4 Turbo' },
      { id: 'openai/gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
      { id: 'anthropic/claude-3-opus', name: 'Claude 3 Opus' },
      { id: 'anthropic/claude-3-sonnet', name: 'Claude 3 Sonnet' },
      { id: 'meta-llama/llama-2-70b-chat', name: 'Llama 2 70B' },
    ];
  },
};
