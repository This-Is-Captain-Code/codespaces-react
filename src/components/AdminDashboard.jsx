import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './AdminDashboard.css';

const API_BASE = '/api/admin';

export function AdminDashboard() {
  const [adminToken, setAdminToken] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [bots, setBots] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editingBot, setEditingBot] = useState(null);
  const [newLimit, setNewLimit] = useState('');

  const apiClient = axios.create({
    baseURL: API_BASE,
    headers: adminToken ? { Authorization: `Bearer ${adminToken}` } : {}
  });

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const [botsRes, statsRes] = await Promise.all([
        apiClient.get('/bots'),
        apiClient.get('/stats')
      ]);
      setBots(botsRes.data.bots);
      setStats(statsRes.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch data');
      if (err.response?.status === 401 || err.response?.status === 403) {
        setIsAuthenticated(false);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = (e) => {
    e.preventDefault();
    if (!adminToken.trim()) return;
    setIsAuthenticated(true);
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchData();
    }
  }, [isAuthenticated, adminToken]);

  const handleUpdateLimit = async (botId) => {
    const limitValue = parseFloat(newLimit);
    if (isNaN(limitValue) || limitValue < 0) {
      setError('Please enter a valid positive number');
      return;
    }

    try {
      await apiClient.put(`/bots/${botId}/limit`, { limitUsd: limitValue });
      setEditingBot(null);
      setNewLimit('');
      await fetchData();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update limit');
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="admin-login">
        <div className="admin-login-card">
          <h1>Admin Dashboard</h1>
          <p>Enter admin token to access</p>
          <form onSubmit={handleLogin}>
            <input
              type="password"
              value={adminToken}
              onChange={(e) => setAdminToken(e.target.value)}
              placeholder="Admin Token"
            />
            <button type="submit">Login</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-dashboard">
      <header className="admin-header">
        <h1>Admin Dashboard</h1>
        <button onClick={() => { setIsAuthenticated(false); setAdminToken(''); }} className="logout-btn">
          Logout
        </button>
      </header>

      {error && <div className="admin-error">{error}</div>}

      {stats && (
        <div className="admin-stats">
          <div className="stat-card">
            <h3>{stats.totalUsers}</h3>
            <p>Total Users</p>
          </div>
          <div className="stat-card">
            <h3>{stats.totalBots}</h3>
            <p>Total Bots</p>
          </div>
          <div className="stat-card">
            <h3>{stats.runningBots}</h3>
            <p>Running</p>
          </div>
          <div className="stat-card">
            <h3>${stats.totalLimits?.toFixed(2) || '0.00'}</h3>
            <p>Total Limits</p>
          </div>
        </div>
      )}

      <div className="admin-section">
        <div className="section-header">
          <h2>User Bots</h2>
          <button onClick={fetchData} disabled={loading} className="refresh-btn">
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>

        {loading && bots.length === 0 ? (
          <p className="loading-text">Loading bots...</p>
        ) : bots.length === 0 ? (
          <p className="empty-text">No bots found</p>
        ) : (
          <div className="bots-table">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Bot Name</th>
                  <th>Model</th>
                  <th>Status</th>
                  <th>Limit</th>
                  <th>Usage</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {bots.map((bot) => (
                  <tr key={bot.botId} className={bot.disabled ? 'disabled-row' : ''}>
                    <td>
                      <span className="user-email">{bot.userEmail || 'N/A'}</span>
                      <span className="user-id">{bot.userId?.slice(0, 8)}...</span>
                    </td>
                    <td>{bot.botName}</td>
                    <td className="model-cell">{bot.model}</td>
                    <td>
                      <span className={`status-badge status-${bot.status}`}>
                        {bot.status}
                      </span>
                      {bot.disabled && <span className="disabled-badge">DISABLED</span>}
                    </td>
                    <td>
                      {editingBot === bot.botId ? (
                        <input
                          type="number"
                          value={newLimit}
                          onChange={(e) => setNewLimit(e.target.value)}
                          className="limit-input"
                          min="0"
                          step="0.01"
                          autoFocus
                        />
                      ) : (
                        <span className="limit-value">
                          ${bot.limitUsd?.toFixed(2) || '0.00'}
                        </span>
                      )}
                    </td>
                    <td>
                      <span className={`usage-value ${bot.usageUsd >= (bot.limitUsd || 0) ? 'over-limit' : ''}`}>
                        ${bot.usageUsd?.toFixed(2) || '0.00'}
                      </span>
                    </td>
                    <td className="actions-cell">
                      {editingBot === bot.botId ? (
                        <>
                          <button onClick={() => handleUpdateLimit(bot.botId)} className="save-btn">
                            Save
                          </button>
                          <button onClick={() => { setEditingBot(null); setNewLimit(''); }} className="cancel-btn">
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => { setEditingBot(bot.botId); setNewLimit(bot.limitUsd?.toString() || '5'); }}
                          className="edit-btn"
                          disabled={!bot.keyHash}
                        >
                          Edit Limit
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
