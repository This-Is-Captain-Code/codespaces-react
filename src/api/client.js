import axios from 'axios';

const API_BASE = '/api';

let authToken = '';

const apiClient = axios.create({
  baseURL: API_BASE,
});

apiClient.interceptors.request.use((config) => {
  if (authToken) {
    config.headers['Authorization'] = `Bearer ${authToken}`;
  }
  return config;
});

export const setAuthToken = (token) => {
  authToken = token;
};

export const botAPI = {
  create: (config) =>
    apiClient.post('/bots/create', config),

  get: () => apiClient.get('/bots/me'),

  update: (config) =>
    apiClient.put('/bots/update', config),

  getStatus: () => apiClient.get('/bots/status'),

  regenerateToken: () =>
    apiClient.post('/bots/regenerate-token'),

  delete: (confirm) =>
    apiClient.delete('/bots/delete', { data: { confirm } }),
};

export const agentAPI = {
  create: (name, systemPrompt) =>
    apiClient.post('/agents', { name, systemPrompt }),

  getAll: () => apiClient.get('/agents'),

  get: (agentId) => apiClient.get(`/agents/${agentId}`),

  update: (agentId, name, systemPrompt) =>
    apiClient.patch(`/agents/${agentId}`, { name, systemPrompt }),

  start: (agentId) => apiClient.post(`/agents/${agentId}/start`),

  stop: (agentId) => apiClient.post(`/agents/${agentId}/stop`),

  delete: (agentId) => apiClient.delete(`/agents/${agentId}`),
};

export const billingAPI = {
  getBalance: () => apiClient.get('/billing/balance'),

  addCredits: (amount) => apiClient.post('/billing/add-credits', { amount }),
};

export const launchAPI = {
  launch: (config) => apiClient.post('/launch', config),

  launchStream: async (config, onProgress, onComplete, onError) => {
    const token = authToken;
    const response = await fetch(`${API_BASE}/launch/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : '',
      },
      body: JSON.stringify(config),
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      let currentEvent = null;
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEvent = line.slice(7);
        } else if (line.startsWith('data: ') && currentEvent) {
          const data = JSON.parse(line.slice(6));
          if (currentEvent === 'progress' && onProgress) {
            onProgress(data);
          } else if (currentEvent === 'complete' && onComplete) {
            onComplete(data);
          } else if (currentEvent === 'error' && onError) {
            onError(data);
          }
          currentEvent = null;
        }
      }
    }
  },

  getStatus: () => apiClient.get('/launch/status'),

  recoverWallet: () => apiClient.post('/launch/recover-wallet'),

  delete: () => apiClient.delete('/launch'),
};
