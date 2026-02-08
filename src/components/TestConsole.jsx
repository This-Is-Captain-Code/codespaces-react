import React, { useState, useCallback, useEffect, useRef } from 'react';
import './TestConsole.css';

const API_BASE = '/api';

function TestConsole() {
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState({});
  const [logs, setLogs] = useState([]);
  const logRef = useRef(null);

  const addLog = useCallback((level, testLabel, message) => {
    const entry = {
      time: new Date().toLocaleTimeString('en-US', { hour12: false, fractionalSecondDigits: 3 }),
      level,
      testLabel,
      message,
    };
    setLogs(prev => [...prev, entry]);
  }, []);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  const runTest = useCallback(async (testId, label, fetchFn) => {
    setLoading(prev => ({ ...prev, [testId]: true }));
    setResults(prev => ({ ...prev, [testId]: { status: 'running', label } }));
    addLog('info', label, 'Starting...');
    const startTime = Date.now();

    try {
      const data = await fetchFn();
      const duration = Date.now() - startTime;

      const hasWarning = data.bridgeLimited || data.quote?.bridgeLimited ||
        data.execution?.bridgeLimited || data.deployment?.skipped ||
        data.summary?.failed > 0;

      const status = hasWarning ? 'warning' : 'success';

      setResults(prev => ({
        ...prev,
        [testId]: { status, label, data, duration },
      }));

      if (hasWarning) {
        addLog('warn', label, `Completed with warnings (${duration}ms)`);
        if (data.bridgeLimited || data.quote?.bridgeLimited) {
          addLog('warn', label, 'Testnet bridges unavailable - expected on testnets');
        }
        if (data.deployment?.skipped) {
          addLog('warn', label, `Deployment skipped: ${data.deployment.reason}`);
        }
        if (data.summary?.failed > 0) {
          const failedNames = Object.entries(data.integrations || {})
            .filter(([, v]) => v.status === 'fail')
            .map(([k]) => k);
          addLog('warn', label, `Failed integrations: ${failedNames.join(', ')}`);
        }
      } else {
        addLog('ok', label, `Passed (${duration}ms)`);
      }
    } catch (err) {
      const duration = Date.now() - startTime;
      let errorData = err.responseJson || err.message;
      setResults(prev => ({
        ...prev,
        [testId]: { status: 'error', label, error: errorData, duration },
      }));
      const msg = typeof errorData === 'string' ? errorData : (errorData?.error || err.message);
      addLog('error', label, `Failed (${duration}ms): ${msg}`);
    } finally {
      setLoading(prev => ({ ...prev, [testId]: false }));
    }
  }, [addLog]);

  const fetchJson = async (url, options = {}) => {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    const data = await res.json();
    if (!res.ok && !data.success && !data.testnet && !data.bridgeLimited && !data.layers) {
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
      description: 'Gets a real quote from LI.FI API (Base Sepolia → Arbitrum Sepolia). Expected to show bridge limitations on testnet.',
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
            fromAddress: '0x0000000000000000000000000000000000000001',
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
      id: 'hook_status',
      label: 'Hook Deploy Status',
      description: 'Checks MoltFeeRouter contract deployment status and admin wallet balance',
      category: 'fees',
      run: () => fetchJson(`${API_BASE}/healthcheck/hook-status`),
    },
    {
      id: 'fee_info',
      label: 'Fee Hook Info',
      description: 'Checks MoltFeeRouter Hook contract configuration',
      category: 'fees',
      run: () => fetchJson(`${API_BASE}/fees/info`),
    },
    {
      id: 'deploy_hook',
      label: 'Deploy MoltFeeRouter',
      description: 'Deploys the MoltFeeRouter Hook contract to Base Sepolia via CREATE2 with address mining',
      category: 'fees',
      run: () =>
        fetchJson(`${API_BASE}/healthcheck/deploy-hook`, {
          method: 'POST',
          body: JSON.stringify({ chain: 'base' }),
        }),
    },
    {
      id: 'yellow_status',
      label: 'Yellow Network Status',
      description: 'ClearSync state channel connection status, auth state, and buffer analytics',
      category: 'yellow',
      run: () => fetchJson(`${API_BASE}/liquidity/yellow/status`),
    },
    {
      id: 'yellow_connect',
      label: 'Connect to ClearNode',
      description: 'Connects to Yellow Network ClearNode via WebSocket and authenticates with EIP-712',
      category: 'yellow',
      run: () =>
        fetchJson(`${API_BASE}/liquidity/yellow/connect`, { method: 'POST' }),
    },
    {
      id: 'yellow_gas',
      label: 'Live Gas Prices',
      description: 'Fetches real-time gas prices from Base, Arbitrum, and Ethereum via on-chain RPC',
      category: 'yellow',
      run: () => fetchJson(`${API_BASE}/liquidity/yellow/gas-prices`),
    },
    {
      id: 'yellow_test_buffer',
      label: 'Test Intent Buffer',
      description: 'Creates an intent and buffers it through Yellow Network with real gas price condition checks',
      category: 'yellow',
      run: () =>
        fetchJson(`${API_BASE}/liquidity/yellow/test-buffer`, {
          method: 'POST',
          body: JSON.stringify({
            amount: '100',
            conditions: { maxGasPriceGwei: 5.0, minFeeGainPercent: 0.3 },
          }),
        }),
    },
    {
      id: 'yellow_config',
      label: 'ClearNode Config',
      description: 'Fetches ClearNode configuration (requires active connection)',
      category: 'yellow',
      run: () => fetchJson(`${API_BASE}/liquidity/yellow/config`),
    },
  ];

  const categories = [
    { key: 'platform', label: 'Platform Health' },
    { key: 'yellow', label: 'Yellow Network' },
    { key: 'liquidity', label: 'Liquidity Layers' },
    { key: 'pipeline', label: 'Full Pipeline' },
    { key: 'fees', label: 'Fee Management' },
  ];

  const runAll = async () => {
    addLog('info', 'Runner', 'Starting all tests...');
    for (const test of tests) {
      await runTest(test.id, test.label, test.run);
    }
    addLog('info', 'Runner', 'All tests complete.');
  };

  const clearResults = () => {
    setResults({});
    setLogs([]);
  };

  const passCount = Object.values(results).filter(r => r.status === 'success').length;
  const warnCount = Object.values(results).filter(r => r.status === 'warning').length;
  const failCount = Object.values(results).filter(r => r.status === 'error').length;
  const total = Object.values(results).filter(r => r.status !== 'running').length;

  return (
    <div className="test-console">
      <header className="test-header">
        <div className="test-header-left">
          <a href="/" className="test-back">← Back</a>
          <h1>Test Console</h1>
          <span className="test-badge">Testnet</span>
        </div>
        <div className="test-header-actions">
          {total > 0 && (
            <div className="test-summary">
              <span className="test-summary-pass">{passCount} passed</span>
              {warnCount > 0 && <span className="test-summary-warn">{warnCount} warning</span>}
              {failCount > 0 && <span className="test-summary-fail">{failCount} failed</span>}
            </div>
          )}
          <button className="test-btn-secondary" onClick={clearResults}>Clear</button>
          <button className="test-btn-primary" onClick={runAll} disabled={Object.values(loading).some(Boolean)}>
            Run All Tests
          </button>
        </div>
      </header>

      <div className="test-layout">
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

        <div className="test-log-panel">
          <div className="test-log-header">
            <h2 className="test-log-title">Logs</h2>
            <span className="test-log-count">{logs.length}</span>
          </div>
          <div className="test-log-body" ref={logRef}>
            {logs.length === 0 && (
              <div className="test-log-empty">Run a test to see logs here</div>
            )}
            {logs.map((entry, i) => (
              <div key={i} className={`test-log-entry test-log-${entry.level}`}>
                <span className="test-log-time">{entry.time}</span>
                <span className={`test-log-level test-log-level-${entry.level}`}>
                  {entry.level === 'ok' ? 'PASS' : entry.level.toUpperCase()}
                </span>
                <span className="test-log-label">[{entry.testLabel}]</span>
                <span className="test-log-msg">{entry.message}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TestResult({ result }) {
  const [expanded, setExpanded] = useState(false);

  const icons = { success: '●', warning: '●', error: '●', running: '◌' };
  const labels = { success: 'Pass', warning: 'Warning', error: 'Fail', running: 'Running' };

  const rawData = result.data || result.error;
  const jsonStr = typeof rawData === 'string' ? rawData : JSON.stringify(rawData, null, 2);

  return (
    <div className="test-result">
      <div className="test-result-header" onClick={() => setExpanded(!expanded)}>
        <span className={`test-status-icon ${result.status}`}>{icons[result.status]}</span>
        <span className={`test-status-label ${result.status}`}>{labels[result.status]}</span>
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
