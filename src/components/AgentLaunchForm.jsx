import React, { useState } from 'react';
import { launchAPI } from '../api/client';
import './AgentLaunchForm.css';

const LAUNCH_STEPS = [
  { key: 'creating_openrouter_key', label: 'Setting up AI model' },
  { key: 'creating_wallet', label: 'Creating agent wallet' },
  { key: 'deploying_agent', label: 'Deploying agent server' },
  { key: 'installing_skills', label: 'Installing skills' },
  { key: 'registering_identity', label: 'Registering on-chain identity' },
  { key: 'deploying_token', label: 'Deploying token' },
  { key: 'finalizing', label: 'Finalizing' },
];

export function AgentLaunchForm({ onLaunchComplete, userWalletAddress }) {
  const [agentName, setAgentName] = useState('');
  const [tokenSymbol, setTokenSymbol] = useState('');
  const [launching, setLaunching] = useState(false);
  const [currentStep, setCurrentStep] = useState(null);
  const [completedSteps, setCompletedSteps] = useState([]);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const handleLaunch = async (e) => {
    e.preventDefault();
    
    if (!agentName.trim() || !tokenSymbol.trim()) {
      setError('Please enter both agent name and token symbol');
      return;
    }

    setLaunching(true);
    setError('');
    setCurrentStep('creating_openrouter_key');
    setCompletedSteps([]);

    try {
      await launchAPI.launchStream(
        {
          agentName: agentName.trim(),
          tokenSymbol: tokenSymbol.trim().toUpperCase(),
          tokenName: agentName.trim(),
          userWalletAddress,
        },
        (progress) => {
          setCurrentStep(progress.step);
          if (progress.status === 'completed') {
            setCompletedSteps((prev) => 
              prev.includes(progress.step) ? prev : [...prev, progress.step]
            );
          }
        },
        (data) => {
          setResult(data);
          setCurrentStep(null);
          setLaunching(false);
          if (onLaunchComplete) {
            onLaunchComplete(data);
          }
        },
        (errorData) => {
          setError(errorData.error || 'Launch failed');
          setCurrentStep(null);
          setLaunching(false);
        }
      );
    } catch (err) {
      setError(err.message || 'Launch failed');
      setCurrentStep(null);
      setLaunching(false);
    }
  };

  if (result) {
    return (
      <div className="launch-success">
        <div className="success-icon">🎉</div>
        <h2>Agent Launched!</h2>
        <div className="launch-details">
          <div className="detail-item">
            <span className="label">Agent:</span>
            <span className="value">{result.agentName}</span>
          </div>
          {result.agentWallet && (
            <div className="detail-item">
              <span className="label">Wallet:</span>
              <span className="value mono">{result.agentWallet.address}</span>
            </div>
          )}
          {result.token && (
            <>
              <div className="detail-item">
                <span className="label">Token:</span>
                <span className="value">${result.token.symbol}</span>
              </div>
              <div className="detail-item">
                <span className="label">Contract:</span>
                <a 
                  href={result.token.basescanUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="value mono link"
                >
                  {result.token.address?.slice(0, 10)}...
                </a>
              </div>
              <a 
                href={result.token.tradeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="trade-button"
              >
                Trade on Clanker
              </a>
            </>
          )}
          {result.erc8004 && (
            <div className="detail-item">
              <span className="label">ERC-8004 ID:</span>
              <span className="value">#{result.erc8004.agentId}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="agent-launch-form">
      <h2>Launch Your AI Agent</h2>
      <p className="subtitle">Create an agent with its own wallet and token in one click</p>

      {!launching ? (
        <form onSubmit={handleLaunch}>
          <div className="form-group">
            <label htmlFor="agentName">Agent Name</label>
            <input
              id="agentName"
              type="text"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              placeholder="e.g., CryptoHelper"
              maxLength={50}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="tokenSymbol">Token Symbol</label>
            <input
              id="tokenSymbol"
              type="text"
              value={tokenSymbol}
              onChange={(e) => setTokenSymbol(e.target.value.toUpperCase())}
              placeholder="e.g., HELP"
              maxLength={10}
              required
            />
            <span className="hint">This will be the ticker for your token on Base</span>
          </div>

          {error && <div className="error-message">{error}</div>}

          <button type="submit" className="launch-button" disabled={launching}>
            🚀 Launch Agent
          </button>

          <div className="fee-info">
            <p>Fee breakdown (1.2% total):</p>
            <ul>
              <li>0.2% - Clanker</li>
              <li>0.1% - Agent treasury</li>
              <li>0.4% - You (dev)</li>
              <li>0.5% - Molt.town</li>
            </ul>
          </div>
        </form>
      ) : (
        <div className="launch-progress">
          <h3>Launching agent...</h3>
          <div className="steps-list">
            {LAUNCH_STEPS.map((step, index) => {
              const isCompleted = completedSteps.includes(step.key);
              const isCurrent = currentStep === step.key;
              const isPending = !isCompleted && !isCurrent;

              return (
                <div 
                  key={step.key} 
                  className={`step-item ${isCompleted ? 'completed' : ''} ${isCurrent ? 'current' : ''} ${isPending ? 'pending' : ''}`}
                >
                  <div className="step-indicator">
                    {isCompleted ? '✓' : isCurrent ? '...' : (index + 1)}
                  </div>
                  <span className="step-label">{step.label}</span>
                </div>
              );
            })}
          </div>
          {error && <div className="error-message">{error}</div>}
        </div>
      )}
    </div>
  );
}
