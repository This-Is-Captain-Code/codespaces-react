import React, { useState, useEffect } from 'react';
import { botAPI } from '../api/client';
import './BotDashboard.css';

const TX_EXPLORER_URLS = {
  'Base': 'https://basescan.org/tx/',
  'Ethereum': 'https://etherscan.io/tx/',
  'Arbitrum': 'https://arbiscan.io/tx/',
  'Arbitrum One': 'https://arbiscan.io/tx/',
  'OP Mainnet': 'https://optimistic.etherscan.io/tx/',
  'Polygon': 'https://polygonscan.com/tx/',
  'Base Sepolia': 'https://sepolia.basescan.org/tx/',
  'Sepolia': 'https://sepolia.etherscan.io/tx/',
  'Arbitrum Sepolia': 'https://sepolia.arbiscan.io/tx/',
};

const ADDRESS_EXPLORER_URLS = {
  'Base': 'https://basescan.org/address/',
  'Ethereum': 'https://etherscan.io/address/',
  'Arbitrum': 'https://arbiscan.io/address/',
  'Arbitrum One': 'https://arbiscan.io/address/',
  'OP Mainnet': 'https://optimistic.etherscan.io/address/',
  'Polygon': 'https://polygonscan.com/address/',
};

function getTxExplorerUrl(chain, txHash) {
  const base = TX_EXPLORER_URLS[chain];
  if (base) return `${base}${txHash}`;
  return `https://etherscan.io/tx/${txHash}`;
}

function getAddressExplorerUrl(chain, address) {
  const base = ADDRESS_EXPLORER_URLS[chain];
  if (base) return `${base}${address}`;
  return `https://etherscan.io/address/${address}`;
}

function buildChatUrl(controlUrl) {
  try {
    const url = new URL(controlUrl);
    url.pathname = '/chat';
    url.searchParams.set('session', 'main');
    return url.toString();
  } catch {
    return controlUrl;
  }
}

export function BotDashboard({ userId }) {
  const [bot, setBot] = useState(null);
  const [token, setToken] = useState(null);
  const [gatewayToken, setGatewayToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [reprovisioning, setReprovisioning] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    botName: '',
    systemPrompt: 'You are a helpful AI assistant.',
    model: 'openrouter/anthropic/claude-opus-4.5',
  });

  useEffect(() => {
    loadBot();
  }, []);

  const loadBot = async () => {
    try {
      const response = await botAPI.get();
      setBot(response.data);
    } catch (err) {
      if (err.response?.status !== 404) {
        console.error('Failed to load bot:', err);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBot = async (e) => {
    e.preventDefault();
    setCreating(true);
    setError('');

    try {
      const response = await botAPI.create(formData);
      setBot(response.data.bot);
      if (response.data.bot.token) {
        setToken(response.data.bot.token);
      }
      if (response.data.bot.gatewayToken) {
        setGatewayToken(response.data.bot.gatewayToken);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create bot');
    } finally {
      setCreating(false);
    }
  };

  const handleReprovision = async () => {
    setReprovisioning(true);
    setError('');
    try {
      await botAPI.reprovision();
      await loadBot();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to reprovision gateway');
    } finally {
      setReprovisioning(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

  if (loading) {
    return <div className="bot-dashboard loading">Loading your bot...</div>;
  }

  if (!bot) {
    return (
      <div className="bot-dashboard">
        <div className="create-bot-card">
          <h2>Create Your Bot</h2>
          <p>Set up your persistent AI bot powered by OpenClaw on Fly.io.</p>

          <form onSubmit={handleCreateBot} className="bot-form">
            <div className="form-group">
              <label>Bot Name</label>
              <input
                type="text"
                value={formData.botName}
                onChange={(e) => setFormData({ ...formData, botName: e.target.value })}
                placeholder="My AI Assistant"
                required
              />
            </div>

            <div className="form-group">
              <label>System Prompt</label>
              <textarea
                value={formData.systemPrompt}
                onChange={(e) => setFormData({ ...formData, systemPrompt: e.target.value })}
                placeholder="You are a helpful AI assistant..."
                rows={4}
              />
            </div>

            <div className="form-group">
              <label>Model</label>
              <select
                value={formData.model}
                onChange={(e) => setFormData({ ...formData, model: e.target.value })}
              >
                <option value="openrouter/anthropic/claude-opus-4.5">Claude Opus 4.5 (OpenRouter)</option>
                <option value="openrouter/anthropic/claude-sonnet-4">Claude Sonnet 4 (OpenRouter)</option>
                <option value="openrouter/openai/gpt-4o">GPT-4o (OpenRouter)</option>
                <option value="openrouter/openai/gpt-4o-mini">GPT-4o Mini (OpenRouter)</option>
              </select>
            </div>

            {error && <div className="error-message">{error}</div>}

            <button type="submit" disabled={creating} className="create-button">
              {creating ? 'Creating Agent...' : 'Create Bot'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="bot-dashboard">
      <div className="bot-info-card">
        <div className="bot-header">
          <h2>{bot.botName}</h2>
          <span className={`status-badge ${bot.status}`}>{bot.status.replace('_', ' ')}</span>
        </div>

        <div className="bot-details">
          <div className="detail-row">
            <span className="label">Model:</span>
            <span className="value">{bot.model}</span>
          </div>
          
          <div className="detail-row">
            <span className="label">System Prompt:</span>
            <span className="value prompt">{bot.systemPrompt}</span>
          </div>

          {bot.endpoint && (
            <div className="detail-row">
              <span className="label">Gateway:</span>
              <div className="value-with-copy">
                <span className="value endpoint">{bot.endpoint}</span>
                <button onClick={() => copyToClipboard(bot.endpoint)} className="copy-btn">Copy</button>
              </div>
            </div>
          )}

          {bot.controlUrl && (
            <>
              <div className="detail-row">
                <span className="label">Control Panel:</span>
                <div className="value-with-copy">
                  <a href={bot.controlUrl} target="_blank" rel="noopener noreferrer" className="link-button">
                    Open OpenClaw Control
                  </a>
                  <button onClick={() => copyToClipboard(bot.controlUrl)} className="copy-btn">Copy URL</button>
                </div>
              </div>
              <div className="detail-row">
                <span className="label">Chat Panel:</span>
                <div className="value-with-copy">
                  <a href={buildChatUrl(bot.controlUrl)} target="_blank" rel="noopener noreferrer" className="link-button">
                    Open Chat
                  </a>
                  <button onClick={() => copyToClipboard(buildChatUrl(bot.controlUrl))} className="copy-btn">Copy URL</button>
                </div>
              </div>
            </>
          )}

          {(gatewayToken || bot.gatewayToken) && (
            <div className="detail-row token-section">
              <span className="label">Gateway Token (for API access):</span>
              <div className="value-with-copy">
                <code className="token-value">{gatewayToken || bot.gatewayToken}</code>
                <button onClick={() => copyToClipboard(gatewayToken || bot.gatewayToken)} className="copy-btn">Copy</button>
              </div>
            </div>
          )}

          {token && (
            <div className="detail-row token-section">
              <span className="label">Your Bot Token (save this!):</span>
              <div className="value-with-copy">
                <code className="token-value">{token}</code>
                <button onClick={() => copyToClipboard(token)} className="copy-btn">Copy</button>
              </div>
              <p className="token-warning">This token is shown only once. Save it securely!</p>
            </div>
          )}

          <div className="detail-row">
            <span className="label">Created:</span>
            <span className="value">{new Date(bot.createdAt).toLocaleDateString()}</span>
          </div>
        </div>

        {(bot.tokenAddress || bot.agentWalletAddress || bot.erc8004Id) && (
          <div className="onchain-section">
            <h3>On-Chain</h3>
            <div className="onchain-details">
              {bot.agentWalletAddress && (
                <div className="detail-row">
                  <span className="label">Agent Wallet:</span>
                  <div className="value-with-copy">
                    <span className="value endpoint">{bot.agentWalletAddress}</span>
                    <button onClick={() => copyToClipboard(bot.agentWalletAddress)} className="copy-btn">Copy</button>
                  </div>
                </div>
              )}
              {bot.tokenAddress && (
                <div className="detail-row">
                  <span className="label">Token ({bot.tokenSymbol}):</span>
                  <div className="value-with-copy">
                    <a href={getAddressExplorerUrl(bot.transactions?.tokenDeploy?.chain || 'Base', bot.tokenAddress)} target="_blank" rel="noopener noreferrer" className="link-button mono-link">
                      {bot.tokenAddress.slice(0, 10)}...{bot.tokenAddress.slice(-8)}
                    </a>
                    <button onClick={() => copyToClipboard(bot.tokenAddress)} className="copy-btn">Copy</button>
                  </div>
                </div>
              )}
              {bot.erc8004Id && (
                <div className="detail-row">
                  <span className="label">ERC-8004 ID:</span>
                  <span className="value">#{bot.erc8004Id}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {bot.transactions && (bot.transactions.tokenDeploy || bot.transactions.erc8004 || bot.transactions.hookRegistration) && (
          <div className="tx-section">
            <h3>Transaction Hashes</h3>
            <div className="tx-list">
              {bot.transactions.tokenDeploy && (
                <div className="tx-row">
                  <span className="tx-label">Token Deploy</span>
                  <a
                    href={getTxExplorerUrl(bot.transactions.tokenDeploy.chain, bot.transactions.tokenDeploy.txHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="tx-link"
                  >
                    {bot.transactions.tokenDeploy.txHash.slice(0, 10)}...{bot.transactions.tokenDeploy.txHash.slice(-8)}
                    <span className="chain-tag">{bot.transactions.tokenDeploy.chain || 'Base'}</span>
                  </a>
                </div>
              )}
              {bot.transactions.erc8004 && (
                <div className="tx-row">
                  <span className="tx-label">ERC-8004 Registration</span>
                  <a
                    href={getTxExplorerUrl(bot.transactions.erc8004.chain, bot.transactions.erc8004.txHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="tx-link"
                  >
                    {bot.transactions.erc8004.txHash.slice(0, 10)}...{bot.transactions.erc8004.txHash.slice(-8)}
                    <span className="chain-tag">{bot.transactions.erc8004.chain || 'Ethereum'}</span>
                  </a>
                </div>
              )}
              {bot.transactions.hookRegistration && (
                <div className="tx-row">
                  <span className="tx-label">Fee Hook Registration</span>
                  <a
                    href={getTxExplorerUrl(bot.transactions.hookRegistration.chain, bot.transactions.hookRegistration.txHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="tx-link"
                  >
                    {bot.transactions.hookRegistration.txHash.slice(0, 10)}...{bot.transactions.hookRegistration.txHash.slice(-8)}
                    <span className="chain-tag">{bot.transactions.hookRegistration.chain || 'Arbitrum'}</span>
                  </a>
                </div>
              )}
            </div>
          </div>
        )}

        {bot.status === 'demo_mode' && (
          <div className="demo-notice">
            Your bot is in demo mode. A gateway needs to be configured to deploy a live agent.
          </div>
        )}

        {bot.status === 'error' && (
          <div className="error-notice">
            Agent creation failed. Please try again or contact support.
          </div>
        )}

        {bot.status === 'running' && (
          <div className="success-notice">
            Your bot is live! Access the OpenClaw control panel for advanced integrations.
          </div>
        )}

        {error && <div className="error-notice">{error}</div>}

        {bot.endpoint && bot.status === 'running' && (
          <div className="reprovision-section">
            <button
              onClick={handleReprovision}
              disabled={reprovisioning}
              className="reprovision-button"
            >
              {reprovisioning ? 'Fixing Connection...' : 'Fix Gateway Connection'}
            </button>
            <span className="reprovision-hint">Use this if the agent shows "gateway token missing" error</span>
          </div>
        )}
      </div>
    </div>
  );
}
