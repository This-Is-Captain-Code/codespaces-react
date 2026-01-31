import axios from 'axios';

const API_BASE = 'http://localhost:3001/api';

// Get auth token (in production, this comes from Privy)
const getAuthToken = () => {
  return localStorage.getItem('authToken') || 'dev-user-123';
};

const apiClient = axios.create({
  baseURL: API_BASE,
  headers: {
    'Authorization': `Bearer ${getAuthToken()}`,
  },
});

// Update token when it changes
export const setAuthToken = (token) => {
  localStorage.setItem('authToken', token);
  apiClient.defaults.headers['Authorization'] = `Bearer ${token}`;
};

// Agent management
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

// Chat
export const chatAPI = {
  sendMessage: (agentId, message, model, conversationHistory) =>
    apiClient.post(`/chat/${agentId}/message`, {
      message,
      model,
      conversationHistory,
    }),
};

// Billing
export const billingAPI = {
  getBalance: () => apiClient.get('/billing/balance'),
  
  addCredits: (amount) => apiClient.post('/billing/add-credits', { amount }),
};
