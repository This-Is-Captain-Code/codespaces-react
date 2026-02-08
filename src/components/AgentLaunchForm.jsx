import React, { useState } from 'react';
import { launchAPI } from '../api/client';
import './AgentLaunchForm.css';

const AI_MODELS = [
  { id: 'anthropic/claude-opus-4.5', name: 'Claude Opus 4.5', provider: 'Anthropic' },
  { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', provider: 'Anthropic' },
  { id: 'openai/gpt-5.2', name: 'GPT 5.2', provider: 'OpenAI' },
  { id: 'deepseek/deepseek-chat-v3.1', name: 'DeepSeek V3.1', provider: 'DeepSeek' },
  { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'Google' },
];

const LAUNCH_STEPS = [
  { key: 'creating_openrouter_key', label: 'Setting up AI model' },
  { key: 'creating_wallet', label: 'Creating agent wallet' },
  { key: 'deploying_agent', label: 'Deploying agent server' },
  { key: 'configuring_telegram', label: 'Configuring Telegram bot' },
  { key: 'installing_skills', label: 'Installing skills' },
  { key: 'registering_identity', label: 'Registering on-chain identity' },
  { key: 'deploying_token', label: 'Deploying token' },
  { key: 'registering_fee_hook', label: 'Registering Uniswap v4 fee hook' },
  { key: 'finalizing', label: 'Finalizing' },
];

export function AgentLaunchForm({ onLaunchComplete, userWalletAddress }) {
  const [agentName, setAgentName] = useState('');
  const [tokenSymbol, setTokenSymbol] = useState('');
  const [selectedModel, setSelectedModel] = useState(AI_MODELS[0].id);
  const [telegramBotToken, setTelegramBotToken] = useState('');
  const [twitterToken, setTwitterToken] = useState('');
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
          model: selectedModel,
          userWalletAddress,
          telegramBotToken: telegramBotToken.trim() || undefined,
          twitterToken: twitterToken.trim() || undefined,
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

  const buildChatUrl = (controlUrl) => {
    try {
      const url = new URL(controlUrl);
      url.pathname = '/chat';
      url.searchParams.set('session', 'main');
      return url.toString();
    } catch {
      return controlUrl;
    }
  };

  if (result) {
    return (
      <div className="launch-success">
        <div className="success-icon">&#127881;</div>
        <h2>Agent Launched!</h2>
        <div className="launch-details">
          <div className="detail-item">
            <span className="label">Agent</span>
            <span className="value">{result.agentName}</span>
          </div>
          {result.agentWallet && (
            <div className="detail-item">
              <span className="label">Wallet</span>
              <span className="value mono">{result.agentWallet.address}</span>
            </div>
          )}
          {result.token && (
            <>
              <div className="detail-item">
                <span className="label">Token</span>
                <span className="value">${result.token.symbol}</span>
              </div>
              <div className="detail-item">
                <span className="label">Contract</span>
                <a 
                  href={result.token.basescanUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="value mono link"
                >
                  {result.token.address?.slice(0, 10)}...
                </a>
              </div>
            </>
          )}
          {result.erc8004 && (
            <div className="detail-item">
              <span className="label">ERC-8004 ID</span>
              <span className="value">#{result.erc8004.agentId}</span>
            </div>
          )}
          {result.telegram && result.telegram.configured && (
            <div className="detail-item">
              <span className="label">Telegram</span>
              <a 
                href={`https://t.me/${result.telegram.username}`}
                target="_blank"
                rel="noopener noreferrer"
                className="value link"
              >
                @{result.telegram.username}
              </a>
            </div>
          )}
        </div>
        
        {result.token && (
          <a 
            href={result.token.tradeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="trade-button"
          >
            Trade on Clanker
          </a>
        )}
        
        {result.controlUrl && (
          <a 
            href={buildChatUrl(result.controlUrl)}
            target="_blank"
            rel="noopener noreferrer"
            className="chat-button"
          >
            Chat with Agent
          </a>
        )}
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

          <div className="form-group">
            <label>AI Model</label>
            <div className="model-selector">
              {AI_MODELS.map((model) => (
                <button
                  key={model.id}
                  type="button"
                  className={`model-button ${selectedModel === model.id ? 'selected' : ''}`}
                  onClick={() => setSelectedModel(model.id)}
                >
                  <span className="model-name">{model.name}</span>
                  <span className="model-provider">{model.provider}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-title">
              <span className="icon">&#128225;</span>
              Telegram Integration
              <span className="optional-badge">Optional</span>
            </div>
            <div className="form-group">
              <label htmlFor="telegramBotToken">Telegram Bot Token</label>
              <input
                id="telegramBotToken"
                type="password"
                value={telegramBotToken}
                onChange={(e) => setTelegramBotToken(e.target.value)}
                placeholder="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"
              />
              <span className="hint">
                Get your bot token from <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer">@BotFather</a> on Telegram
              </span>
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-title">
              <span className="icon">&#120143;</span>
              Twitter Integration
              <span className="optional-badge">Coming Soon</span>
            </div>
            <div className="form-group">
              <label htmlFor="twitterToken">Twitter API Token</label>
              <input
                id="twitterToken"
                type="password"
                value={twitterToken}
                onChange={(e) => setTwitterToken(e.target.value)}
                placeholder="Your Twitter API Bearer Token"
                disabled
              />
              <span className="hint">
                Twitter integration coming soon
              </span>
            </div>
          </div>

          {error && <div className="error-message">{error}</div>}

          <button type="submit" className="launch-button" disabled={launching}>
            Launch Agent
          </button>

          <div className="fee-info">
            <p>Dynamic fees via Uniswap v4 Hook:</p>
            <ul>
              <li>0.25% - 1.0% base fee (volume-adjusted)</li>
              <li>Split: Agent / Dev / Platform / Admin</li>
              <li>Agent AI controls fee mode and optimization</li>
              <li>Graduated creator share over token lifecycle</li>
            </ul>
          </div>
        </form>
      ) : (
        <div className="launch-progress">
          <h3>Launching your agent...</h3>
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
