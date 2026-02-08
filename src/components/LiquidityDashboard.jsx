import React, { useState, useEffect, useCallback } from 'react';
import './LiquidityDashboard.css';

const API_BASE = import.meta.env.VITE_API_URL || '';

export function LiquidityDashboard({ botId }) {
  const [status, setStatus] = useState(null);
  const [observation, setObservation] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [intentForm, setIntentForm] = useState({
    intentType: 'MOVE_LIQUIDITY',
    sourceChain: 'base',
    destChain: 'arbitrum',
    amount: '',
    tokenSymbol: 'USDC',
    minFeeGain: '0.5',
    maxGasCost: '5.0',
  });
  const [pipelineResult, setPipelineResult] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const [statusRes, observeRes, analyticsRes] = await Promise.all([
        fetch(`${API_BASE}/api/liquidity/status`),
        fetch(`${API_BASE}/api/liquidity/observe`),
        fetch(`${API_BASE}/api/liquidity/analytics`),
      ]);

      const [statusData, observeData, analyticsData] = await Promise.all([
        statusRes.json(),
        observeRes.json(),
        analyticsRes.json(),
      ]);

      setStatus(statusData);
      setObservation(observeData);
      setAnalytics(analyticsData);
    } catch (err) {
      console.error('Failed to fetch liquidity data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleExecutePipeline = async (e) => {
    e.preventDefault();
    setExecuting(true);
    setPipelineResult(null);

    try {
      const res = await fetch(`${API_BASE}/api/liquidity/execute-pipeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botId: botId || undefined,
          intentType: intentForm.intentType,
          sourceChain: intentForm.sourceChain,
          destChain: intentForm.destChain,
          amount: intentForm.amount,
          tokenSymbol: intentForm.tokenSymbol,
          conditions: {
            minFeeGainPercent: parseFloat(intentForm.minFeeGain),
            maxGasCostUsd: parseFloat(intentForm.maxGasCost),
          },
        }),
      });

      const data = await res.json();
      setPipelineResult(data);
      fetchData();
    } catch (err) {
      setPipelineResult({ error: err.message });
    } finally {
      setExecuting(false);
    }
  };

  if (loading) {
    return (
      <div className="liquidity-dashboard loading-state">
        <div className="liq-spinner" />
        <span>Loading liquidity data...</span>
      </div>
    );
  }

  return (
    <div className="liquidity-dashboard">
      <div className="liq-header">
        <h3>Liquidity Manager</h3>
        <div className="liq-header-badges">
          <span className="liq-badge liq-badge-chain">Base → Arbitrum</span>
          <span className={`liq-badge ${status?.layers?.intentBuffer?.testnet ? 'liq-badge-testnet' : 'liq-badge-live'}`}>
            {status?.layers?.intentBuffer?.testnet ? 'Testnet' : 'Mainnet'}
          </span>
        </div>
      </div>

      <div className="liq-layers">
        <div className="liq-layer">
          <div className="liq-layer-icon">1</div>
          <div className="liq-layer-info">
            <span className="liq-layer-name">OpenClaw</span>
            <span className="liq-layer-role">Decision</span>
          </div>
          <span className="liq-layer-status active">Active</span>
        </div>
        <div className="liq-layer-arrow">→</div>
        <div className="liq-layer">
          <div className="liq-layer-icon">2</div>
          <div className="liq-layer-info">
            <span className="liq-layer-name">Yellow Network</span>
            <span className="liq-layer-role">Buffer</span>
          </div>
          <span className={`liq-layer-status ${status?.layers?.intentBuffer?.configured ? 'active' : 'inactive'}`}>
            {status?.layers?.intentBuffer?.configured ? 'Ready' : 'Off'}
          </span>
        </div>
        <div className="liq-layer-arrow">→</div>
        <div className="liq-layer">
          <div className="liq-layer-icon">3</div>
          <div className="liq-layer-info">
            <span className="liq-layer-name">LI.FI</span>
            <span className="liq-layer-role">Movement</span>
          </div>
          <span className={`liq-layer-status ${status?.layers?.movement?.configured ? 'active' : 'inactive'}`}>
            {status?.layers?.movement?.configured ? 'Ready' : 'Off'}
          </span>
        </div>
        <div className="liq-layer-arrow">→</div>
        <div className="liq-layer">
          <div className="liq-layer-icon">4</div>
          <div className="liq-layer-info">
            <span className="liq-layer-name">Uniswap v4</span>
            <span className="liq-layer-role">Deploy</span>
          </div>
          <span className={`liq-layer-status ${status?.layers?.deployment?.configured ? 'active' : 'inactive'}`}>
            {status?.layers?.deployment?.configured ? 'Ready' : 'Off'}
          </span>
        </div>
      </div>

      <div className="liq-grid">
        <div className="liq-card">
          <h4>Pool State</h4>
          {observation?.poolState && (
            <div className="liq-stats">
              <div className="liq-stat">
                <span className="liq-stat-label">Chain</span>
                <span className="liq-stat-value">{observation.poolState.chain}</span>
              </div>
              <div className="liq-stat">
                <span className="liq-stat-label">TVL</span>
                <span className="liq-stat-value">${observation.poolState.tvl || '0'}</span>
              </div>
              <div className="liq-stat">
                <span className="liq-stat-label">24h Volume</span>
                <span className="liq-stat-value">${observation.poolState.volume24h || '0'}</span>
              </div>
              <div className="liq-stat">
                <span className="liq-stat-label">Fee Rate</span>
                <span className="liq-stat-value">{observation.poolState.feeRate || '0'}%</span>
              </div>
              <div className="liq-stat">
                <span className="liq-stat-label">APY</span>
                <span className="liq-stat-value highlight">{observation.poolState.apy || '0'}%</span>
              </div>
              <div className="liq-stat">
                <span className="liq-stat-label">Fee Mode</span>
                <span className="liq-stat-value">{observation.poolState.feeMode || 'N/A'}</span>
              </div>
            </div>
          )}
        </div>

        <div className="liq-card">
          <h4>Yellow Network Buffer</h4>
          <div className="liq-stats">
            <div className="liq-stat">
              <span className="liq-stat-label">Pending</span>
              <span className="liq-stat-value">{observation?.buffer?.pendingCount || 0}</span>
            </div>
            <div className="liq-stat">
              <span className="liq-stat-label">Buffered</span>
              <span className="liq-stat-value">{observation?.buffer?.bufferedCount || 0}</span>
            </div>
            <div className="liq-stat">
              <span className="liq-stat-label">Active Batches</span>
              <span className="liq-stat-value">{observation?.buffer?.batches?.length || 0}</span>
            </div>
            <div className="liq-stat">
              <span className="liq-stat-label">Mode</span>
              <span className="liq-stat-value">{observation?.buffer?.mode || 'local_batching'}</span>
            </div>
          </div>
        </div>

        <div className="liq-card">
          <h4>Analytics</h4>
          <div className="liq-stats">
            {analytics?.intents?.map((row) => (
              <div className="liq-stat" key={row.status}>
                <span className="liq-stat-label">Intents ({row.status})</span>
                <span className="liq-stat-value">{row.count}</span>
              </div>
            ))}
            {analytics?.positions?.map((row) => (
              <div className="liq-stat" key={row.chain}>
                <span className="liq-stat-label">Positions ({row.chain})</span>
                <span className="liq-stat-value">{row.count} ({row.total_amount})</span>
              </div>
            ))}
            {analytics?.movements?.map((row) => (
              <div className="liq-stat" key={`mov-${row.status}`}>
                <span className="liq-stat-label">Movements ({row.status})</span>
                <span className="liq-stat-value">{row.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {observation?.recentIntents && observation.recentIntents.length > 0 && (
        <div className="liq-card liq-intents-card">
          <h4>Recent Intents</h4>
          <div className="liq-intents-list">
            {observation.recentIntents.map((intent) => (
              <div className="liq-intent-row" key={intent.id}>
                <span className={`liq-intent-type type-${intent.intent_type.toLowerCase()}`}>
                  {intent.intent_type}
                </span>
                <span className="liq-intent-route">
                  {intent.source_chain} → {intent.dest_chain}
                </span>
                <span className="liq-intent-amount">
                  {intent.amount} {intent.token_symbol}
                </span>
                <span className={`liq-intent-status status-${intent.status}`}>
                  {intent.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {observation?.activePositions && observation.activePositions.length > 0 && (
        <div className="liq-card liq-positions-card">
          <h4>Active Positions</h4>
          <div className="liq-positions-list">
            {observation.activePositions.map((pos) => (
              <div className="liq-position-row" key={pos.id}>
                <span className="liq-pos-chain">{pos.chain}</span>
                <span className="liq-pos-token">{pos.token_symbol || 'Token'}</span>
                <span className="liq-pos-amount">{pos.amount}</span>
                <span className={`liq-pos-status status-${pos.status}`}>{pos.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="liq-card liq-execute-card">
        <h4>Execute Pipeline</h4>
        <p className="liq-execute-desc">
          Create an intent and run the full pipeline: Buffer → Move → Deploy
        </p>
        <form onSubmit={handleExecutePipeline} className="liq-execute-form">
          <div className="liq-form-row">
            <select
              value={intentForm.intentType}
              onChange={(e) => setIntentForm({ ...intentForm, intentType: e.target.value })}
            >
              <option value="MOVE_LIQUIDITY">Move Liquidity</option>
              <option value="DEPLOY_CAPITAL">Deploy Capital</option>
              <option value="REBALANCE">Rebalance</option>
              <option value="WITHDRAW">Withdraw</option>
            </select>
            <select
              value={intentForm.sourceChain}
              onChange={(e) => setIntentForm({ ...intentForm, sourceChain: e.target.value })}
            >
              <option value="base">Base</option>
              <option value="arbitrum">Arbitrum</option>
              <option value="ethereum">Ethereum</option>
              <option value="optimism">Optimism</option>
              <option value="polygon">Polygon</option>
            </select>
            <span className="liq-arrow">→</span>
            <select
              value={intentForm.destChain}
              onChange={(e) => setIntentForm({ ...intentForm, destChain: e.target.value })}
            >
              <option value="arbitrum">Arbitrum</option>
              <option value="base">Base</option>
              <option value="ethereum">Ethereum</option>
              <option value="optimism">Optimism</option>
              <option value="polygon">Polygon</option>
            </select>
          </div>
          <div className="liq-form-row">
            <input
              type="text"
              value={intentForm.amount}
              onChange={(e) => setIntentForm({ ...intentForm, amount: e.target.value })}
              placeholder="Amount"
              required
            />
            <input
              type="text"
              value={intentForm.tokenSymbol}
              onChange={(e) => setIntentForm({ ...intentForm, tokenSymbol: e.target.value })}
              placeholder="Token"
            />
            <input
              type="text"
              value={intentForm.minFeeGain}
              onChange={(e) => setIntentForm({ ...intentForm, minFeeGain: e.target.value })}
              placeholder="Min fee gain %"
            />
            <input
              type="text"
              value={intentForm.maxGasCost}
              onChange={(e) => setIntentForm({ ...intentForm, maxGasCost: e.target.value })}
              placeholder="Max gas $"
            />
          </div>
          <button type="submit" disabled={executing || !intentForm.amount} className="liq-execute-btn">
            {executing ? 'Executing...' : 'Execute Pipeline'}
          </button>
        </form>

        {pipelineResult && (
          <div className={`liq-result ${pipelineResult.error ? 'liq-result-error' : 'liq-result-success'}`}>
            {pipelineResult.error ? (
              <p>Error: {pipelineResult.error}</p>
            ) : (
              <>
                <p><strong>Stage:</strong> {pipelineResult.stage}</p>
                {pipelineResult.intent && (
                  <p><strong>Intent:</strong> {pipelineResult.intent.intent_type} - {pipelineResult.intent.status}</p>
                )}
                {pipelineResult.quote && (
                  <p><strong>Route:</strong> {pipelineResult.quote.bridgeUsed} | Gas: ${pipelineResult.quote.gasCostUsd}</p>
                )}
                {pipelineResult.execution && (
                  <p><strong>Execution:</strong> {pipelineResult.execution.status} | Tx: {pipelineResult.execution.txHash?.slice(0, 14)}...</p>
                )}
                {pipelineResult.deployment && (
                  <p><strong>Deployed:</strong> {pipelineResult.deployment.chain} | Hook: {pipelineResult.deployment.hookAddress ? 'Active' : 'None'}</p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
