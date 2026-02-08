import React, { useState, useEffect } from 'react';
import './FeeAnalytics.css';

const API_BASE = import.meta.env.VITE_API_URL || '';

export function FeeAnalytics({ tokenAddress, agentName, tokenSymbol }) {
  const [analytics, setAnalytics] = useState(null);
  const [hookInfo, setHookInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updating, setUpdating] = useState(false);

  const fetchAnalytics = async () => {
    try {
      const infoRes = await fetch(`${API_BASE}/api/fees/info`);
      if (infoRes.ok) {
        const infoData = await infoRes.json();
        setHookInfo(infoData);
      } else {
        setHookInfo({ configured: false });
      }

      if (tokenAddress) {
        const analyticsRes = await fetch(`${API_BASE}/api/fees/analytics/${tokenAddress}`);
        if (analyticsRes.ok) {
          const data = await analyticsRes.json();
          setAnalytics(data);
        }
      }
      setError(null);
    } catch (err) {
      setError('Failed to load fee analytics');
      if (!hookInfo) setHookInfo({ configured: false });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
    const interval = setInterval(fetchAnalytics, 30000);
    return () => clearInterval(interval);
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

  if (error && !hookInfo) {
    return null;
  }

  if (!hookInfo?.configured) {
    return (
      <div className="fee-analytics not-configured">
        <div className="fee-header">
          <h3>Fee Router</h3>
          <span className="fee-badge pending">Not Configured</span>
        </div>
        <p className="fee-description">Uniswap v4 Hook not deployed yet. Set MOLT_FEE_ROUTER_ADDRESS to enable.</p>
      </div>
    );
  }

  const hasPoolData = analytics && !analytics.error && analytics.currentFee !== undefined;

  const safeNum = (val, fallback = 0) => {
    const n = Number(val);
    return isNaN(n) ? fallback : n;
  };

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

      <div className="fee-contract-info">
        <div className="contract-detail">
          <span className="contract-label">Hook Contract</span>
          <span className="contract-value mono">{hookInfo.hookAddress}</span>
        </div>
        <div className="contract-detail">
          <span className="contract-label">Network</span>
          <span className="contract-value">{hookInfo.network?.chain} ({hookInfo.network?.isTestnet ? 'Testnet' : 'Mainnet'})</span>
        </div>
        <div className="contract-detail">
          <span className="contract-label">Pool Manager</span>
          <span className="contract-value mono">{hookInfo.network?.poolManager}</span>
        </div>
        <div className="contract-detail">
          <span className="contract-label">Position Manager</span>
          <span className="contract-value mono">{hookInfo.network?.positionManager}</span>
        </div>
        <div className="contract-detail">
          <span className="contract-label">Permit2</span>
          <span className="contract-value mono">{hookInfo.network?.permit2}</span>
        </div>
        <div className="contract-detail">
          <span className="contract-label">WETH</span>
          <span className="contract-value mono">{hookInfo.network?.weth}</span>
        </div>
      </div>

      {!tokenAddress && (
        <div className="fee-no-token">
          <p>No token deployed yet. Deploy a token to see pool analytics and fee data.</p>
        </div>
      )}

      {tokenAddress && analytics?.error && (
        <div className="fee-error-state">
          <p>Pool not initialized for this token. The fee hook is deployed but no pool has been registered yet.</p>
          <p className="fee-error-detail">Token: {tokenAddress}</p>
        </div>
      )}

      {hasPoolData && (
        <>
          <div className="fee-grid">
            <div className="fee-card">
              <div className="fee-card-label">Current Fee</div>
              <div className="fee-card-value">{(safeNum(analytics.currentFee) / 100).toFixed(2)}%</div>
              <div className="fee-card-sub">Volume-adjusted</div>
            </div>

            <div className="fee-card">
              <div className="fee-card-label">24h Volume</div>
              <div className="fee-card-value">{safeNum(analytics.volume?.dailyVolume).toFixed(4)} ETH</div>
              <div className="fee-card-sub">
                {safeNum(analytics.volume?.dailyVolume) >= 100 ? 'High tier' :
                 safeNum(analytics.volume?.dailyVolume) >= 10 ? 'Medium tier' : 'Low tier'}
              </div>
            </div>

            <div className="fee-card">
              <div className="fee-card-label">Pool Phase</div>
              <div className="fee-card-value">{phaseLabels[analytics.poolPhase] || analytics.poolPhase}</div>
              <div className="fee-card-sub">Age: {Math.floor(safeNum(analytics.poolAge) / 86400)}d</div>
            </div>

            <div className="fee-card">
              <div className="fee-card-label">Fee Mode</div>
              <div className="fee-card-value" style={{ color: modeColors[analytics.feeMode] || '#fff' }}>
                {analytics.feeMode ? analytics.feeMode.charAt(0).toUpperCase() + analytics.feeMode.slice(1) : 'N/A'}
              </div>
              <div className="fee-card-sub">Agent-controlled</div>
            </div>
          </div>

          <div className="fee-split-section">
            <h4>Fee Distribution</h4>
            <div className="fee-split-bar">
              <div className="fee-split-segment agent" style={{ width: `${safeNum(analytics.currentSplit?.agentBps) / 100}%` }}></div>
              <div className="fee-split-segment dev" style={{ width: `${safeNum(analytics.currentSplit?.devBps) / 100}%` }}></div>
              <div className="fee-split-segment platform" style={{ width: `${safeNum(analytics.currentSplit?.platformBps) / 100}%` }}></div>
              <div className="fee-split-segment admin" style={{ width: `${safeNum(analytics.currentSplit?.adminBps) / 100}%` }}></div>
            </div>
            <div className="fee-split-legend">
              <div className="legend-item"><span className="legend-dot agent"></span> Agent {(safeNum(analytics.currentSplit?.agentBps) / 100).toFixed(1)}%</div>
              <div className="legend-item"><span className="legend-dot dev"></span> Dev {(safeNum(analytics.currentSplit?.devBps) / 100).toFixed(1)}%</div>
              <div className="legend-item"><span className="legend-dot platform"></span> Platform {(safeNum(analytics.currentSplit?.platformBps) / 100).toFixed(1)}%</div>
              <div className="legend-item"><span className="legend-dot admin"></span> Admin {(safeNum(analytics.currentSplit?.adminBps) / 100).toFixed(1)}%</div>
            </div>
          </div>

          <div className="fee-accrued-section">
            <h4>Accrued Fees (ETH)</h4>
            <div className="fee-accrued-grid">
              <div className="accrued-item">
                <span className="accrued-label">Agent</span>
                <span className="accrued-value">{safeNum(analytics.accruedFees?.agentFees).toFixed(6)}</span>
              </div>
              <div className="accrued-item">
                <span className="accrued-label">Developer</span>
                <span className="accrued-value">{safeNum(analytics.accruedFees?.devFees).toFixed(6)}</span>
              </div>
              <div className="accrued-item">
                <span className="accrued-label">Platform</span>
                <span className="accrued-value">{safeNum(analytics.accruedFees?.platformFees).toFixed(6)}</span>
              </div>
              <div className="accrued-item">
                <span className="accrued-label">Admin</span>
                <span className="accrued-value">{safeNum(analytics.accruedFees?.adminFees).toFixed(6)}</span>
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
        </>
      )}

      {(analytics?.testnet || hookInfo?.network?.isTestnet) && (
        <div className="fee-testnet-badge">
          Testnet Mode — {hasPoolData ? 'Live on-chain data' : 'Hook deployed, awaiting pool registration'}
        </div>
      )}
    </div>
  );
}
