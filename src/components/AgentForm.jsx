import React, { useState } from 'react';
import { agentAPI } from '../api/client';
import './AgentForm.css';

export function AgentForm({ onAgentCreated }) {
  const [name, setName] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await agentAPI.create(name, systemPrompt);
      setName('');
      setSystemPrompt('');
      onAgentCreated(response.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create agent');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="agent-form">
      <h2>Create New Agent</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="name">Agent Name</label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Research Assistant"
            required
            disabled={loading}
          />
        </div>

        <div className="form-group">
          <label htmlFor="systemPrompt">System Prompt</label>
          <textarea
            id="systemPrompt"
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="Define how your agent should behave..."
            rows={4}
            disabled={loading}
          />
        </div>

        {error && <div className="error">{error}</div>}

        <button type="submit" disabled={loading || !name}>
          {loading ? 'Creating...' : 'Create Agent'}
        </button>
      </form>
    </div>
  );
}
