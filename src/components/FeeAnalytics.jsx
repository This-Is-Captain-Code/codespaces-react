import React, { useState, useEffect } from 'react';
import './FeeAnalytics.css';

const API_BASE = import.meta.env.VITE_API_URL || '';

export function FeeAnalytics({ tokenAddress, agentName, tokenSymbol }) {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updating, setUpdating] = useState(false);

  const fetchAnalytics = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/fees/analytics/${tokenAddress}`);
      const data = await res.json();
      setAnalytics(data);
      setError(null);
    } catch (err) {
      setError('Failed to load fee analytics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tokenAddress) {
      fetchAnalytics();
      const interval = setInterval(fetchAnalytics, 30000);
      return () => clearInterval(interval);
    }
  }, [tokenAddress]);

  const handleSetFeeMode = async (mode) => {
    setUpdating(true);
    try {
      const res = await fetch(`${API_BASE}/api/fees/set-mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokenAddress, feeMode: mode }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchAnalytics();
      }
    } catch (err) {
      console.error('Failed to set fee mode:', err);
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="fee-analytics loading-state">
        <div className="fee-spinner"></div>
        <span>Loading fee analytics...</span>
      </div>
    );
  }

  if (error || !analytics) {
    return null;
  }

  if (!analytics.configured) {
    return (
      <div className="fee-analytics not-configured">
        <div className="fee-header">
          <h3>Fee Router</h3>
          <span className="fee-badge pending">Not Configured</span>
        </div>
        <p className="fee-description">Uniswap v4 Hook not deployed yet</p>
      </div>
    );
  }

  const phaseLabels = { early: 'Early (7d)', growth: 'Growth (30d)', mature: 'Mature' };
  const modeColors = { conservative: '#3b82f6', balanced: '#00ff6a', aggressive: '#ff4d00' };

  return (
    <div className="fee-analytics">
      <div className="fee-header">
        <h3>Dynamic Fee Router</h3>
        <span className="fee-badge live">
          <span className="live-dot"></span>
          Uniswap v4 Hook
        </span>
      </div>

      <div className="fee-grid">
        <div className="fee-card">
          <div className="fee-card-label">Current Fee</div>
          <div className="fee-card-value">{(analytics.currentFee / 100).toFixed(2)}%</div>
          <div className="fee-card-sub">Volume-adjusted</div>
        </div>

        <div className="fee-card">
          <div className="fee-card-label">24h Volume</div>
          <div className="fee-card-value">{parseFloat(analytics.volume?.dailyVolume || 0).toFixed(4)} ETH</div>
          <div className="fee-card-sub">
            {parseFloat(analytics.volume?.dailyVolume || 0) >= 100 ? 'High tier' :
             parseFloat(analytics.volume?.dailyVolume || 0) >= 10 ? 'Medium tier' : 'Low tier'}
          </div>
        </div>

        <div className="fee-card">
          <div className="fee-card-label">Pool Phase</div>
          <div className="fee-card-value">{phaseLabels[analytics.poolPhase] || analytics.poolPhase}</div>
          <div className="fee-card-sub">Age: {Math.floor((analytics.poolAge || 0) / 86400)}d</div>
        </div>

        <div className="fee-card">
          <div className="fee-card-label">Fee Mode</div>
          <div className="fee-card-value" style={{ color: modeColors[analytics.feeMode] }}>
            {analytics.feeMode?.charAt(0).toUpperCase() + analytics.feeMode?.slice(1)}
          </div>
          <div className="fee-card-sub">Agent-controlled</div>
        </div>
      </div>

      <div className="fee-split-section">
        <h4>Fee Distribution</h4>
        <div className="fee-split-bar">
          <div
            className="fee-split-segment agent"
            style={{ width: `${(analytics.currentSplit?.agentBps / 100) || 0}%` }}
            title={`Agent: ${(analytics.currentSplit?.agentBps / 100).toFixed(1)}%`}
          ></div>
          <div
            className="fee-split-segment dev"
            style={{ width: `${(analytics.currentSplit?.devBps / 100) || 0}%` }}
            title={`Dev: ${(analytics.currentSplit?.devBps / 100).toFixed(1)}%`}
          ></div>
          <div
            className="fee-split-segment platform"
            style={{ width: `${(analytics.currentSplit?.platformBps / 100) || 0}%` }}
            title={`Platform: ${(analytics.currentSplit?.platformBps / 100).toFixed(1)}%`}
          ></div>
          <div
            className="fee-split-segment admin"
            style={{ width: `${(analytics.currentSplit?.adminBps / 100) || 0}%` }}
            title={`Admin: ${(analytics.currentSplit?.adminBps / 100).toFixed(1)}%`}
          ></div>
        </div>
        <div className="fee-split-legend">
          <div className="legend-item"><span className="legend-dot agent"></span> Agent {(analytics.currentSplit?.agentBps / 100).toFixed(1)}%</div>
          <div className="legend-item"><span className="legend-dot dev"></span> Dev {(analytics.currentSplit?.devBps / 100).toFixed(1)}%</div>
          <div className="legend-item"><span className="legend-dot platform"></span> Platform {(analytics.currentSplit?.platformBps / 100).toFixed(1)}%</div>
          <div className="legend-item"><span className="legend-dot admin"></span> Admin {(analytics.currentSplit?.adminBps / 100).toFixed(1)}%</div>
        </div>
      </div>

      <div className="fee-accrued-section">
        <h4>Accrued Fees (ETH)</h4>
        <div className="fee-accrued-grid">
          <div className="accrued-item">
            <span className="accrued-label">Agent</span>
            <span className="accrued-value">{parseFloat(analytics.accruedFees?.agentFees || 0).toFixed(6)}</span>
          </div>
          <div className="accrued-item">
            <span className="accrued-label">Developer</span>
            <span className="accrued-value">{parseFloat(analytics.accruedFees?.devFees || 0).toFixed(6)}</span>
          </div>
          <div className="accrued-item">
            <span className="accrued-label">Platform</span>
            <span className="accrued-value">{parseFloat(analytics.accruedFees?.platformFees || 0).toFixed(6)}</span>
          </div>
          <div className="accrued-item">
            <span className="accrued-label">Admin</span>
            <span className="accrued-value">{parseFloat(analytics.accruedFees?.adminFees || 0).toFixed(6)}</span>
          </div>
        </div>
      </div>

      <div className="fee-mode-section">
        <h4>Fee Mode Control</h4>
        <p className="fee-mode-description">The AI agent can adjust its fee strategy. Higher agent share in aggressive mode.</p>
        <div className="fee-mode-buttons">
          {['conservative', 'balanced', 'aggressive'].map((mode) => (
            <button
              key={mode}
              className={`fee-mode-btn ${analytics.feeMode === mode ? 'active' : ''}`}
              onClick={() => handleSetFeeMode(mode)}
              disabled={updating || analytics.feeMode === mode}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {analytics.simulated && (
        <div className="fee-testnet-badge">
          Testnet Mode - Simulated data
        </div>
      )}
    </div>
  );
}
