import React, { useState, useEffect, useCallback } from 'react';
import './LiquidityDashboard.css';

const API_BASE = import.meta.env.VITE_API_URL || '';

const CHAIN_EXPLORERS = {
  base: 'https://basescan.org/tx/',
  ethereum: 'https://etherscan.io/tx/',
  arbitrum: 'https://arbiscan.io/tx/',
  optimism: 'https://optimistic.etherscan.io/tx/',
  polygon: 'https://polygonscan.com/tx/',
};

function getExplorerUrl(chain, txHash) {
  const base = CHAIN_EXPLORERS[chain?.toLowerCase()] || 'https://etherscan.io/tx/';
  return `${base}${txHash}`;
}

export function LiquidityDashboard({ botId }) {
  const [status, setStatus] = useState(null);
  const [observation, setObservation] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [yellowStatus, setYellowStatus] = useState(null);
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
      const [statusRes, observeRes, analyticsRes, yellowRes] = await Promise.all([
        fetch(`${API_BASE}/api/liquidity/status`),
        fetch(`${API_BASE}/api/liquidity/observe`),
        fetch(`${API_BASE}/api/liquidity/analytics`),
        fetch(`${API_BASE}/api/liquidity/yellow/status`),
      ]);

      const [statusData, observeData, analyticsData, yellowData] = await Promise.all([
        statusRes.json(),
        observeRes.json(),
        analyticsRes.json(),
        yellowRes.json(),
      ]);

      setStatus(statusData);
      setObservation(observeData);
      setAnalytics(analyticsData);
      setYellowStatus(yellowData);
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

  const isTestnet = status?.layers?.intentBuffer?.testnet;
  const yellowMode = yellowStatus?.mode || observation?.buffer?.mode || 'local_batching';
  const yellowConnected = yellowStatus?.connected || false;
  const yellowAuthenticated = yellowStatus?.authenticated || false;
  const clearNodeEndpoint = yellowStatus?.endpoint || status?.layers?.intentBuffer?.endpoint;

  const getYellowStatusLabel = () => {
    if (yellowAuthenticated) return { text: 'Live', cls: 'active' };
    if (yellowConnected) return { text: 'Connected (Not Auth)', cls: 'warning' };
    return { text: 'Local Batching', cls: 'inactive' };
  };

  const yellowLabel = getYellowStatusLabel();

  const hasIntents = analytics?.intents?.some(r => parseInt(r.count) > 0);
  const hasPositions = analytics?.positions?.some(r => parseInt(r.count) > 0);
  const hasMovements = analytics?.movements?.some(r => parseInt(r.count) > 0);

  return (
    <div className="liquidity-dashboard">
      <div className="liq-header">
        <h3>Liquidity Manager</h3>
        <div className="liq-header-badges">
          <span className="liq-badge liq-badge-chain">
            {(status?.layers?.movement?.sourceChain || 'Base').charAt(0).toUpperCase() + (status?.layers?.movement?.sourceChain || 'base').slice(1)} &rarr; {(status?.layers?.deployment?.primaryChain || 'Arbitrum').charAt(0).toUpperCase() + (status?.layers?.deployment?.primaryChain || 'arbitrum').slice(1)}
          </span>
          <span className={`liq-badge ${isTestnet ? 'liq-badge-testnet' : 'liq-badge-live'}`}>
            {isTestnet ? 'Testnet' : 'Mainnet'}
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
        <div className="liq-layer-arrow">&rarr;</div>
        <div className="liq-layer">
          <div className="liq-layer-icon">2</div>
          <div className="liq-layer-info">
            <span className="liq-layer-name">Yellow Network</span>
            <span className="liq-layer-role">Buffer</span>
          </div>
          <span className={`liq-layer-status ${yellowLabel.cls}`}>
            {yellowLabel.text}
          </span>
        </div>
        <div className="liq-layer-arrow">&rarr;</div>
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
        <div className="liq-layer-arrow">&rarr;</div>
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
              {observation.poolState.message ? (
                <div className="liq-stat-message">{observation.poolState.message}</div>
              ) : (
                <>
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
                </>
              )}
            </div>
          )}
        </div>

        <div className="liq-card">
          <h4>Yellow Network</h4>
          <div className="liq-stats">
            <div className="liq-stat">
              <span className="liq-stat-label">Mode</span>
              <span className={`liq-stat-value ${yellowMode === 'clearsync' ? 'highlight' : ''}`}>
                {yellowMode === 'clearsync' ? 'ClearSync Live' : 'Local Batching'}
              </span>
            </div>
            <div className="liq-stat">
              <span className="liq-stat-label">ClearNode</span>
              <span className={`liq-stat-value ${yellowConnected ? 'highlight' : ''}`}>
                {yellowConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            <div className="liq-stat">
              <span className="liq-stat-label">Authenticated</span>
              <span className={`liq-stat-value ${yellowAuthenticated ? 'highlight' : ''}`}>
                {yellowAuthenticated ? 'Yes' : 'No'}
              </span>
            </div>
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
          </div>
          {!yellowAuthenticated && (
            <div className="liq-yellow-notice">
              {yellowConnected
                ? 'Connected to ClearNode but not authenticated. Create a channel at apps.yellow.com with your admin wallet to enable ClearSync.'
                : 'ClearNode not connected. Using local DB-backed intent batching with real on-chain gas price evaluation.'}
            </div>
          )}
        </div>

        {(hasIntents || hasPositions || hasMovements) && (
          <div className="liq-card">
            <h4>Analytics</h4>
            <div className="liq-stats">
              {analytics?.intents?.filter(r => parseInt(r.count) > 0).map((row) => (
                <div className="liq-stat" key={row.status}>
                  <span className="liq-stat-label">Intents ({row.status})</span>
                  <span className="liq-stat-value">{row.count}</span>
                </div>
              ))}
              {analytics?.positions?.filter(r => parseInt(r.count) > 0).map((row) => (
                <div className="liq-stat" key={row.chain}>
                  <span className="liq-stat-label">Positions ({row.chain})</span>
                  <span className="liq-stat-value">{row.count} ({row.total_amount})</span>
                </div>
              ))}
              {analytics?.movements?.filter(r => parseInt(r.count) > 0).map((row) => (
                <div className="liq-stat" key={`mov-${row.status}`}>
                  <span className="liq-stat-label">Movements ({row.status})</span>
                  <span className="liq-stat-value">{row.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="liq-card liq-contracts-card">
        <h4>Contract Addresses</h4>
        <div className="liq-contract-grid">
          {status?.layers?.deployment?.poolManager && (
            <div className="liq-contract-row">
              <span className="liq-contract-label">Pool Manager</span>
              <span className="liq-contract-addr">{status.layers.deployment.poolManager}</span>
            </div>
          )}
          {status?.layers?.deployment?.positionManager && (
            <div className="liq-contract-row">
              <span className="liq-contract-label">Position Manager</span>
              <span className="liq-contract-addr">{status.layers.deployment.positionManager}</span>
            </div>
          )}
          {status?.layers?.deployment?.hookAddress && (
            <div className="liq-contract-row">
              <span className="liq-contract-label">MoltFeeRouter Hook</span>
              <span className="liq-contract-addr">{status.layers.deployment.hookAddress}</span>
            </div>
          )}
          {status?.layers?.deployment?.permit2 && (
            <div className="liq-contract-row">
              <span className="liq-contract-label">Permit2</span>
              <span className="liq-contract-addr">{status.layers.deployment.permit2}</span>
            </div>
          )}
          {clearNodeEndpoint && (
            <div className="liq-contract-row">
              <span className="liq-contract-label">ClearNode</span>
              <span className="liq-contract-addr">{clearNodeEndpoint}</span>
            </div>
          )}
          {yellowStatus?.address && (
            <div className="liq-contract-row">
              <span className="liq-contract-label">Admin Wallet</span>
              <span className="liq-contract-addr">{yellowStatus.address}</span>
            </div>
          )}
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
                  {intent.source_chain} &rarr; {intent.dest_chain}
                </span>
                <span className="liq-intent-amount">
                  {intent.amount} {intent.token_symbol}
                </span>
                <span className={`liq-intent-status status-${intent.status}`}>
                  {intent.status}
                </span>
                {intent.tx_hash_source && (
                  <a
                    href={getExplorerUrl(intent.source_chain, intent.tx_hash_source)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="liq-intent-tx-link"
                    title="View transaction on explorer"
                  >
                    TX
                  </a>
                )}
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
          Create an intent and run the full pipeline: Buffer &rarr; Move &rarr; Deploy
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
            <span className="liq-arrow">&rarr;</span>
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
                  <p><strong>Execution:</strong> {pipelineResult.execution.status}{pipelineResult.execution.txHash ? ` | Tx: ${pipelineResult.execution.txHash.slice(0, 14)}...` : ''}</p>
                )}
                {pipelineResult.deployment && (
                  <p><strong>Deploy:</strong> {pipelineResult.deployment.skipped ? pipelineResult.deployment.reason : `${pipelineResult.deployment.chain} | Hook: Active`}</p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
