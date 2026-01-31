import axios from 'axios';

const API_BASE = '/api';

const getAuthToken = () => {
  return localStorage.getItem('authToken') || '';
};

const apiClient = axios.create({
  baseURL: API_BASE,
});

apiClient.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

export const setAuthToken = (token) => {
  localStorage.setItem('authToken', token);
};

export const clearAuthToken = () => {
  localStorage.removeItem('authToken');
};

export const isAuthenticated = () => {
  return !!getAuthToken();
};

export const authAPI = {
  signup: (email, password) =>
    apiClient.post('/auth/signup', { email, password }),

  login: (email, password) =>
    apiClient.post('/auth/login', { email, password }),

  me: () => apiClient.get('/auth/me'),
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

export const chatAPI = {
  sendMessage: (agentId, message, model, conversationHistory) =>
    apiClient.post(`/chat/${agentId}/message`, {
      message,
      model,
      conversationHistory,
    }),
};

export const billingAPI = {
  getBalance: () => apiClient.get('/billing/balance'),

  addCredits: (amount) => apiClient.post('/billing/add-credits', { amount }),
};
