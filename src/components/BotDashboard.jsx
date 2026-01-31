import React, { useState, useEffect } from 'react';
import { botAPI } from '../api/client';
import './BotDashboard.css';

export function BotDashboard({ userId }) {
  const [bot, setBot] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    botName: '',
    systemPrompt: 'You are a helpful AI assistant.',
    model: 'openai/gpt-3.5-turbo',
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
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create bot');
    } finally {
      setCreating(false);
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
          <p>Set up your persistent AI bot powered by OpenClaw.</p>

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
                <option value="openai/gpt-3.5-turbo">GPT-3.5 Turbo</option>
                <option value="openai/gpt-4-turbo">GPT-4 Turbo</option>
                <option value="anthropic/claude-3-sonnet">Claude 3 Sonnet</option>
                <option value="anthropic/claude-3-opus">Claude 3 Opus</option>
              </select>
            </div>

            {error && <div className="error-message">{error}</div>}

            <button type="submit" disabled={creating} className="create-button">
              {creating ? 'Deploying to Railway...' : 'Create Bot'}
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
              <span className="label">Endpoint:</span>
              <div className="value-with-copy">
                <span className="value endpoint">{bot.endpoint}</span>
                <button onClick={() => copyToClipboard(bot.endpoint)} className="copy-btn">Copy</button>
              </div>
            </div>
          )}

          {bot.controlUrl && (
            <div className="detail-row">
              <span className="label">Control Panel:</span>
              <a href={bot.controlUrl} target="_blank" rel="noopener noreferrer" className="link-button">
                Open OpenClaw Control
              </a>
            </div>
          )}

          {bot.setupUrl && bot.setupPassword && (
            <div className="detail-row">
              <span className="label">Setup URL:</span>
              <div className="value-with-copy">
                <a href={bot.setupUrl} target="_blank" rel="noopener noreferrer" className="value endpoint">
                  {bot.setupUrl}
                </a>
                <button onClick={() => copyToClipboard(bot.setupPassword)} className="copy-btn">Copy Password</button>
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

        {bot.status === 'demo_mode' && (
          <div className="demo-notice">
            Your bot is in demo mode. Railway credentials are required to deploy a live OpenClaw instance.
          </div>
        )}

        {bot.status === 'error' && (
          <div className="error-notice">
            Deployment failed. Please check Railway credentials and try again.
          </div>
        )}

        {bot.status === 'running' && (
          <div className="success-notice">
            Your bot is live! Access the OpenClaw control panel to configure integrations like Telegram or Discord.
          </div>
        )}
      </div>
    </div>
  );
}
