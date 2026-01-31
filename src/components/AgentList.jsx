import React from 'react';
import { agentAPI } from '../api/client';
import './AgentList.css';

export function AgentList({ agents, onAgentUpdated }) {
  const [loading, setLoading] = React.useState({});

  const handleStart = async (agentId) => {
    setLoading((prev) => ({ ...prev, [agentId]: 'starting' }));
    try {
      const response = await agentAPI.start(agentId);
      onAgentUpdated(response.data);
    } catch (error) {
      console.error('Failed to start agent:', error);
      alert(error.response?.data?.error || 'Failed to start agent');
    } finally {
      setLoading((prev) => ({ ...prev, [agentId]: null }));
    }
  };

  const handleStop = async (agentId) => {
    setLoading((prev) => ({ ...prev, [agentId]: 'stopping' }));
    try {
      const response = await agentAPI.stop(agentId);
      onAgentUpdated(response.data);
    } catch (error) {
      console.error('Failed to stop agent:', error);
      alert(error.response?.data?.error || 'Failed to stop agent');
    } finally {
      setLoading((prev) => ({ ...prev, [agentId]: null }));
    }
  };

  const handleDelete = async (agentId) => {
    if (!window.confirm('Are you sure you want to delete this agent?')) return;

    setLoading((prev) => ({ ...prev, [agentId]: 'deleting' }));
    try {
      await agentAPI.delete(agentId);
      onAgentUpdated(null); // Trigger refresh
    } catch (error) {
      console.error('Failed to delete agent:', error);
      alert(error.response?.data?.error || 'Failed to delete agent');
    } finally {
      setLoading((prev) => ({ ...prev, [agentId]: null }));
    }
  };

  if (!agents || agents.length === 0) {
    return <div className="agent-list-empty">No agents yet. Create one to get started!</div>;
  }

  return (
    <div className="agent-list">
      <h2>Your Agents</h2>
      <div className="agents">
        {agents.map((agent) => (
          <div key={agent.id} className={`agent-card status-${agent.state}`}>
            <div className="agent-header">
              <h3>{agent.name}</h3>
              <span className={`status-badge status-${agent.state}`}>
                {agent.state}
              </span>
            </div>

            {agent.systemPrompt && (
              <p className="system-prompt">{agent.systemPrompt}</p>
            )}

            <div className="agent-meta">
              <small>Created: {new Date(agent.createdAt).toLocaleDateString()}</small>
            </div>

            <div className="agent-actions">
              {agent.state === 'stopped' ? (
                <button
                  onClick={() => handleStart(agent.id)}
                  disabled={loading[agent.id]}
                  className="btn-primary"
                >
                  {loading[agent.id] === 'starting' ? 'Starting...' : 'Start'}
                </button>
              ) : (
                <button
                  onClick={() => handleStop(agent.id)}
                  disabled={loading[agent.id]}
                  className="btn-secondary"
                >
                  {loading[agent.id] === 'stopping' ? 'Stopping...' : 'Stop'}
                </button>
              )}

              <button
                onClick={() => handleDelete(agent.id)}
                disabled={loading[agent.id] || agent.state === 'running'}
                className="btn-danger"
              >
                {loading[agent.id] === 'deleting' ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
