import React, { useState, useEffect } from 'react';
import { botAPI } from '../api/client';
import './BotDashboard.css';

export function BotDashboard({ userId }) {
  const [bot, setBot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    botName: '',
    systemPrompt: 'You are a helpful AI assistant.',
    model: 'gpt-3.5-turbo',
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
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create bot');
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return <div className="bot-dashboard loading">Loading your bot...</div>;
  }

  if (!bot) {
    return (
      <div className="bot-dashboard">
        <div className="create-bot-card">
          <h2>Create Your Bot</h2>
          <p>Set up your persistent AI bot that runs on OpenClaw.</p>

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
                <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                <option value="gpt-4-turbo-preview">GPT-4 Turbo</option>
                <option value="claude-3-sonnet">Claude 3 Sonnet</option>
                <option value="claude-3-opus">Claude 3 Opus</option>
              </select>
            </div>

            {error && <div className="error-message">{error}</div>}

            <button type="submit" disabled={creating} className="create-button">
              {creating ? 'Creating Bot...' : 'Create Bot'}
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
          <span className={`status-badge ${bot.status}`}>{bot.status}</span>
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
              <span className="value endpoint">{bot.endpoint}</span>
            </div>
          )}
          <div className="detail-row">
            <span className="label">Created:</span>
            <span className="value">{new Date(bot.createdAt).toLocaleDateString()}</span>
          </div>
        </div>

        {bot.status === 'demo_mode' && (
          <div className="demo-notice">
            Your bot is running in demo mode. Configure Railway credentials to deploy a live instance.
          </div>
        )}
      </div>
    </div>
  );
}
