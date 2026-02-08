import React, { useState, useEffect } from 'react';
import { launchAPI } from '../api/client';
import { AgentLaunchForm } from './AgentLaunchForm';
import { FeeAnalytics } from './FeeAnalytics';
import { LiquidityDashboard } from './LiquidityDashboard';
import './AgentDashboard.css';

export function AgentDashboard({ userWalletAddress, onLogout }) {
  const [agent, setAgent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);

  const fetchAgentStatus = async () => {
    try {
      const response = await launchAPI.getStatus();
      if (response.data.hasAgent) {
        setAgent(response.data);
      } else {
        setAgent(null);
      }
    } catch (err) {
      console.error('Failed to fetch agent status:', err);
      setError('Failed to load agent status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAgentStatus();
  }, []);

  const handleLaunchComplete = (result) => {
    fetchAgentStatus();
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete your agent? This cannot be undone.')) {
      return;
    }

    setDeleting(true);
    try {
      await launchAPI.delete();
      setAgent(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete agent');
    } finally {
      setDeleting(false);
    }
  };

  const handleRecoverWallet = async () => {
    try {
      const response = await launchAPI.recoverWallet();
      alert(`Wallet recovered: ${response.data.address}`);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to recover wallet');
    }
  };

  if (loading) {
    return (
      <div className="agent-dashboard loading">
        <div className="spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="agent-dashboard">
        <div className="header">
          <h1>Molt.town</h1>
          <button onClick={onLogout} className="logout-btn">Logout</button>
        </div>
        <AgentLaunchForm 
          onLaunchComplete={handleLaunchComplete}
          userWalletAddress={userWalletAddress}
        />
      </div>
    );
  }

  return (
    <div className="agent-dashboard">
      <div className="header">
        <h1>Molt.town</h1>
        <button onClick={onLogout} className="logout-btn">Logout</button>
      </div>

      <div className="agent-card">
        <div className="agent-header">
          <div className="agent-status">
            <span className={`status-dot ${agent.status}`}></span>
            <span className="status-text">{agent.status}</span>
          </div>
          <h2>{agent.agentName}</h2>
        </div>

        <div className="info-section">
          <h3>Agent</h3>
          <div className="info-grid">
            <div className="info-item">
              <span className="label">Endpoint</span>
              <a href={agent.controlUrl || agent.endpoint} target="_blank" rel="noopener noreferrer" className="value link">
                {agent.endpoint}
              </a>
            </div>
            <div className="info-item">
              <span className="label">Model</span>
              <span className="value">{agent.model}</span>
            </div>
          </div>
        </div>

        {agent.agentWallet && (
          <div className="info-section">
            <h3>Agent Wallet</h3>
            <div className="info-grid">
              <div className="info-item full">
                <span className="label">Address</span>
                <span className="value mono">{agent.agentWallet.address}</span>
              </div>
              <div className="wallet-actions">
                <a 
                  href={`https://basescan.org/address/${agent.agentWallet.address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="action-btn"
                >
                  View on Basescan
                </a>
              </div>
            </div>
          </div>
        )}

        {agent.token && (
          <div className="info-section">
            <h3>Token</h3>
            <div className="info-grid">
              <div className="info-item">
                <span className="label">Symbol</span>
                <span className="value">${agent.token.symbol}</span>
              </div>
              <div className="info-item">
                <span className="label">Name</span>
                <span className="value">{agent.token.name}</span>
              </div>
              <div className="info-item full">
                <span className="label">Contract</span>
                <a 
                  href={`https://basescan.org/token/${agent.token.address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="value mono link"
                >
                  {agent.token.address}
                </a>
              </div>
              <div className="token-actions">
                <a 
                  href={agent.token.explorerUrl || `https://basescan.org/token/${agent.token.address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="trade-btn"
                >
                  View on Explorer
                </a>
              </div>
            </div>
          </div>
        )}

        {agent.token && (
          <FeeAnalytics
            tokenAddress={agent.token.address}
            agentName={agent.agentName}
            tokenSymbol={agent.token.symbol}
          />
        )}

        <LiquidityDashboard botId={agent.botId} />

        {agent.erc8004 && (
          <div className="info-section">
            <h3>On-Chain Identity (ERC-8004)</h3>
            <div className="info-grid">
              <div className="info-item">
                <span className="label">Agent ID</span>
                <span className="value">#{agent.erc8004.agentId}</span>
              </div>
            </div>
          </div>
        )}

        {agent.userWallet && (
          <div className="info-section">
            <h3>Your Wallet</h3>
            <div className="info-grid">
              <div className="info-item full">
                <span className="label">Address</span>
                <span className="value mono">{agent.userWallet}</span>
              </div>
            </div>
          </div>
        )}

        <div className="danger-zone">
          <h3>Danger Zone</h3>
          <div className="danger-actions">
            <button onClick={handleRecoverWallet} className="recover-btn">
              Recover Wallet
            </button>
            <button onClick={handleDelete} disabled={deleting} className="delete-btn">
              {deleting ? 'Deleting...' : 'Delete Agent'}
            </button>
          </div>
        </div>

        {error && <div className="error-message">{error}</div>}
      </div>
    </div>
  );
}
