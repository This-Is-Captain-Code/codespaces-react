import React, { useState, useCallback } from 'react';
import './TestConsole.css';

const API_BASE = '/api';

function TestConsole() {
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState({});

  const runTest = useCallback(async (testId, label, fetchFn) => {
    setLoading(prev => ({ ...prev, [testId]: true }));
    setResults(prev => ({ ...prev, [testId]: { status: 'running', label } }));
    const startTime = Date.now();

    try {
      const data = await fetchFn();
      const duration = Date.now() - startTime;
      setResults(prev => ({
        ...prev,
        [testId]: { status: 'success', label, data, duration },
      }));
    } catch (err) {
      const duration = Date.now() - startTime;
      let errorData;
      try {
        errorData = err.responseJson || err.message;
      } catch {
        errorData = err.message;
      }
      setResults(prev => ({
        ...prev,
        [testId]: { status: 'error', label, error: errorData, duration },
      }));
    } finally {
      setLoading(prev => ({ ...prev, [testId]: false }));
    }
  }, []);

  const fetchJson = async (url, options = {}) => {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    const data = await res.json();
    if (!res.ok && !data.success) {
      const err = new Error(data.error || `HTTP ${res.status}`);
      err.responseJson = data;
      throw err;
    }
    return data;
  };

  const tests = [
    {
      id: 'integrations',
      label: 'Platform Integrations',
      description: 'Tests Fly.io, Privy, OpenRouter, token deploy, and ERC-8004 contracts',
      category: 'platform',
      run: () => fetchJson(`${API_BASE}/healthcheck/integrations`),
    },
    {
      id: 'liquidity_status',
      label: 'Liquidity System Status',
      description: 'Checks configuration of all 4 layers (OpenClaw, Yellow Network, LI.FI, Uniswap v4)',
      category: 'liquidity',
      run: () => fetchJson(`${API_BASE}/liquidity/status`),
    },
    {
      id: 'liquidity_observe',
      label: 'Observe Market State',
      description: 'Reads pool state, buffer status, recent intents, and positions',
      category: 'liquidity',
      run: () => fetchJson(`${API_BASE}/liquidity/observe`),
    },
    {
      id: 'liquidity_analytics',
      label: 'Liquidity Analytics',
      description: 'Aggregate analytics: intent counts, positions, and cross-chain movements',
      category: 'liquidity',
      run: () => fetchJson(`${API_BASE}/liquidity/analytics`),
    },
    {
      id: 'create_intent',
      label: 'Create Intent',
      description: 'Creates a MOVE_LIQUIDITY intent (Base → Arbitrum, 100 USDC)',
      category: 'liquidity',
      run: () =>
        fetchJson(`${API_BASE}/liquidity/intents`, {
          method: 'POST',
          body: JSON.stringify({
            intentType: 'MOVE_LIQUIDITY',
            sourceChain: 'base',
            destChain: 'arbitrum',
            amount: '100',
            tokenSymbol: 'USDC',
            conditions: { minFeeGainPercent: 0.5 },
          }),
        }),
    },
    {
      id: 'list_intents',
      label: 'List Intents',
      description: 'Lists all liquidity intents from the database',
      category: 'liquidity',
      run: () => fetchJson(`${API_BASE}/liquidity/intents`),
    },
    {
      id: 'lifi_quote',
      label: 'LI.FI Cross-Chain Quote',
      description: 'Gets a real quote from LI.FI API (Base Sepolia → Arbitrum Sepolia)',
      category: 'liquidity',
      run: () =>
        fetchJson(`${API_BASE}/liquidity/quote`, {
          method: 'POST',
          body: JSON.stringify({
            fromChain: 'base',
            toChain: 'arbitrum',
            fromToken: 'ETH',
            toToken: 'ETH',
            fromAmount: '1000000000000000',
          }),
        }),
    },
    {
      id: 'full_pipeline',
      label: 'Full Pipeline Execution',
      description: 'Runs all 4 layers: buffer intent → get quote → execute move → deploy liquidity',
      category: 'pipeline',
      run: () =>
        fetchJson(`${API_BASE}/liquidity/execute-pipeline`, {
          method: 'POST',
          body: JSON.stringify({
            intentType: 'MOVE_LIQUIDITY',
            sourceChain: 'base',
            destChain: 'arbitrum',
            amount: '500',
            tokenSymbol: 'USDC',
            conditions: { minFeeGainPercent: 0.5 },
          }),
        }),
    },
    {
      id: 'fee_info',
      label: 'Fee Hook Info',
      description: 'Checks MoltFeeRouter Hook contract configuration',
      category: 'fees',
      run: () => fetchJson(`${API_BASE}/fees/info`),
    },
  ];

  const categories = [
    { key: 'platform', label: 'Platform Health' },
    { key: 'liquidity', label: 'Liquidity Layers' },
    { key: 'pipeline', label: 'Full Pipeline' },
    { key: 'fees', label: 'Fee Management' },
  ];

  const runAll = async () => {
    for (const test of tests) {
      await runTest(test.id, test.label, test.run);
    }
  };

  const clearResults = () => {
    setResults({});
  };

  return (
    <div className="test-console">
      <header className="test-header">
        <div className="test-header-left">
          <a href="/" className="test-back">← Back</a>
          <h1>Test Console</h1>
          <span className="test-badge">Testnet</span>
        </div>
        <div className="test-header-actions">
          <button className="test-btn-secondary" onClick={clearResults}>Clear</button>
          <button className="test-btn-primary" onClick={runAll} disabled={Object.values(loading).some(Boolean)}>
            Run All Tests
          </button>
        </div>
      </header>

      <div className="test-grid">
        {categories.map(cat => (
          <div key={cat.key} className="test-category">
            <h2 className="test-category-label">{cat.label}</h2>
            <div className="test-cards">
              {tests
                .filter(t => t.category === cat.key)
                .map(test => (
                  <div key={test.id} className={`test-card ${results[test.id]?.status || ''}`}>
                    <div className="test-card-header">
                      <div>
                        <h3>{test.label}</h3>
                        <p className="test-description">{test.description}</p>
                      </div>
                      <button
                        className="test-run-btn"
                        onClick={() => runTest(test.id, test.label, test.run)}
                        disabled={loading[test.id]}
                      >
                        {loading[test.id] ? '...' : 'Run'}
                      </button>
                    </div>
                    {results[test.id] && (
                      <TestResult result={results[test.id]} />
                    )}
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TestResult({ result }) {
  const [expanded, setExpanded] = useState(false);

  const statusIcon = result.status === 'success' ? '●' : result.status === 'error' ? '●' : '◌';
  const statusLabel = result.status === 'success' ? 'Pass' : result.status === 'error' ? 'Fail' : 'Running';

  const rawData = result.status === 'success' ? result.data : result.error;
  const jsonStr = typeof rawData === 'string' ? rawData : JSON.stringify(rawData, null, 2);

  return (
    <div className="test-result">
      <div className="test-result-header" onClick={() => setExpanded(!expanded)}>
        <span className={`test-status-icon ${result.status}`}>{statusIcon}</span>
        <span className="test-status-label">{statusLabel}</span>
        {result.duration && <span className="test-duration">{result.duration}ms</span>}
        <span className="test-expand">{expanded ? '▾' : '▸'}</span>
      </div>
      {expanded && (
        <pre className="test-json">{jsonStr}</pre>
      )}
    </div>
  );
}

export default TestConsole;
