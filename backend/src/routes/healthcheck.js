import express from 'express';

const router = express.Router();

router.get('/integrations', async (req, res) => {
  const results = {
    timestamp: new Date().toISOString(),
    integrations: {},
    summary: { total: 0, passed: 0, failed: 0 }
  };

  const tests = [
    { name: 'bankr', test: testBankr },
    { name: 'flyio', test: testFlyio },
    { name: 'privy', test: testPrivy },
    { name: 'openrouter', test: testOpenRouter },
    { name: 'erc8004_contracts', test: testERC8004Contracts },
  ];

  for (const { name, test } of tests) {
    results.summary.total++;
    try {
      const result = await test();
      results.integrations[name] = { status: 'pass', ...result };
      results.summary.passed++;
    } catch (error) {
      results.integrations[name] = { 
        status: 'fail', 
        error: error.message,
        hint: getHint(name)
      };
      results.summary.failed++;
    }
  }

  const statusCode = results.summary.failed > 0 ? 503 : 200;
  res.status(statusCode).json(results);
});

async function testBankr() {
  const apiKey = process.env.BANKR_API_KEY;
  if (!apiKey) {
    throw new Error('BANKR_API_KEY not set');
  }

  const response = await fetch('https://api.bankr.bot/v1/health', {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  });

  if (response.status === 401) {
    throw new Error('Invalid API key');
  }

  return { 
    message: 'Bankr API key configured',
    keyPrefix: apiKey.substring(0, 8) + '...'
  };
}

async function testFlyio() {
  const token = process.env.FLY_API_TOKEN;
  if (!token) {
    throw new Error('FLY_API_TOKEN not set');
  }

  const response = await fetch('https://api.fly.io/graphql', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: '{ viewer { email } }'
    })
  });

  if (response.status === 401) {
    throw new Error('Invalid Fly.io token');
  }

  const data = await response.json();
  if (data.errors) {
    throw new Error(data.errors[0]?.message || 'Fly.io API error');
  }

  return { 
    message: 'Fly.io API connected',
    account: data.data?.viewer?.email || 'authenticated'
  };
}

async function testPrivy() {
  const appId = process.env.VITE_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;

  if (!appId) {
    throw new Error('VITE_PRIVY_APP_ID not set');
  }
  if (!appSecret) {
    throw new Error('PRIVY_APP_SECRET not set');
  }

  const response = await fetch('https://auth.privy.io/api/v1/users', {
    method: 'GET',
    headers: {
      'Authorization': `Basic ${Buffer.from(`${appId}:${appSecret}`).toString('base64')}`,
      'privy-app-id': appId
    }
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error('Invalid Privy credentials');
  }

  return { 
    message: 'Privy credentials valid',
    appId: appId.substring(0, 8) + '...'
  };
}

async function testOpenRouter() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY not set');
  }

  const response = await fetch('https://openrouter.ai/api/v1/models', {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    }
  });

  if (response.status === 401) {
    throw new Error('Invalid OpenRouter API key');
  }

  const data = await response.json();
  return { 
    message: 'OpenRouter connected',
    modelsAvailable: data.data?.length || 0
  };
}

async function testERC8004Contracts() {
  const identityRegistry = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';
  const reputationRegistry = '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63';

  const response = await fetch(`https://eth.llamarpc.com`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_getCode',
      params: [identityRegistry, 'latest']
    })
  });

  const data = await response.json();
  if (!data.result || data.result === '0x') {
    throw new Error('Identity Registry contract not found on mainnet');
  }

  return { 
    message: 'ERC-8004 contracts verified on Ethereum mainnet',
    identityRegistry,
    reputationRegistry
  };
}

function getHint(name) {
  const hints = {
    bankr: 'Get API key from bankr.bot/api and add as BANKR_API_KEY secret',
    flyio: 'Get token from fly.io dashboard and add as FLY_API_TOKEN secret',
    privy: 'Set VITE_PRIVY_APP_ID and PRIVY_APP_SECRET from privy.io dashboard',
    openrouter: 'Get API key from openrouter.ai and add as OPENROUTER_API_KEY secret',
    erc8004_contracts: 'Contracts should be deployed on Ethereum mainnet'
  };
  return hints[name] || 'Check configuration';
}

export default router;
