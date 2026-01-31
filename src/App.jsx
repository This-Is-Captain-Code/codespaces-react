import React, { useState, useEffect } from 'react';
import './App.css';
import { AgentForm } from './components/AgentForm';
import { AgentList } from './components/AgentList';
import { ChatInterface } from './components/ChatInterface';
import { BillingCard } from './components/BillingCard';
import { agentAPI } from './api/client';

function App() {
  const [agents, setAgents] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAgents();
  }, []);

  const loadAgents = async () => {
    try {
      const response = await agentAPI.getAll();
      setAgents(response.data);
    } catch (error) {
      console.error('Failed to load agents:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAgentCreated = (newAgent) => {
    setAgents((prev) => [...prev, newAgent]);
  };

  const handleAgentUpdated = (updatedAgent) => {
    if (updatedAgent === null) {
      // Agent was deleted
      loadAgents();
    } else {
      // Agent was updated
      setAgents((prev) =>
        prev.map((a) => (a.id === updatedAgent.id ? updatedAgent : a))
      );
      if (selectedAgent?.id === updatedAgent.id) {
        setSelectedAgent(updatedAgent);
      }
    }
  };

  return (
    <div className="App">
      <header className="app-header">
        <div className="header-content">
          <h1>🚀 MoltRack v0</h1>
          <p>Persistent OpenClaw Agent Runtime</p>
        </div>
      </header>

      <main className="app-main">
        <div className="sidebar">
          <BillingCard />
          <AgentForm onAgentCreated={handleAgentCreated} />
          {loading ? (
            <div className="loading">Loading agents...</div>
          ) : (
            <AgentList
              agents={agents}
              onAgentUpdated={handleAgentUpdated}
            />
          )}
        </div>

        <div className="chat-panel">
          {selectedAgent ? (
            <ChatInterface agentId={selectedAgent.id} agent={selectedAgent} />
          ) : agents.length > 0 ? (
            <div className="chat-placeholder">
              <p>Select an agent from the list to start chatting</p>
            </div>
          ) : (
            <div className="chat-placeholder">
              <p>Create an agent to get started</p>
            </div>
          )}
        </div>
      </main>

      <footer className="app-footer">
        <p>MoltRack v0 • Powered by OpenClaw & OpenRouter</p>
      </footer>
    </div>
  );
}

export default App;
