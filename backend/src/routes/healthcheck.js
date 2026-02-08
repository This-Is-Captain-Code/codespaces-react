import express from 'express';
import { tokenDeployService } from '../services/tokenDeployService.js';
import { createPublicClient, createWalletClient, http, keccak256, encodeAbiParameters, parseAbiParameters, concat, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base, baseSepolia, arbitrum, arbitrumSepolia } from 'viem/chains';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const router = express.Router();

const USE_TESTNET = process.env.USE_TESTNET === 'true';

router.get('/generate-wallet', async (req, res) => {
  try {
    const wallet = tokenDeployService.generateWallet();
    const networkInfo = tokenDeployService.getNetworkInfo();
    res.json({
      success: true,
      wallet: {
        address: wallet.address,
        privateKey: wallet.privateKey,
      },
      network: networkInfo.chain,
      note: 'Save the private key securely! Add as ADMIN_WALLET_PRIVATE_KEY secret.',
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/integrations', async (req, res) => {
  const results = {
    timestamp: new Date().toISOString(),
    networkMode: USE_TESTNET ? 'TESTNET' : 'MAINNET',
    integrations: {},
    summary: { total: 0, passed: 0, failed: 0 }
  };

  const tests = [
    { name: 'flyio', test: testFlyio },
    { name: 'privy', test: testPrivy },
    { name: 'openrouter', test: testOpenRouter },
    { name: 'token_deploy', test: testTokenDeploy },
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

async function testTokenDeploy() {
  const adminKey = process.env.ADMIN_WALLET_PRIVATE_KEY;
  if (!adminKey) {
    throw new Error('ADMIN_WALLET_PRIVATE_KEY not set');
  }

  try {
    const { createPublicClient, http } = await import('viem');
    const { privateKeyToAccount } = await import('viem/accounts');
    
    const networkInfo = tokenDeployService.getNetworkInfo();
    const viemChains = await import('viem/chains');
    const chainNameMap = {
      'Base': viemChains.base, 'Base Sepolia': viemChains.baseSepolia,
      'Ethereum': viemChains.mainnet, 'Sepolia': viemChains.sepolia,
      'Arbitrum One': viemChains.arbitrum, 'Arbitrum Sepolia': viemChains.arbitrumSepolia,
      'OP Mainnet': viemChains.optimism, 'Optimism Sepolia': viemChains.optimismSepolia,
      'Polygon': viemChains.polygon, 'Polygon Amoy': viemChains.polygonAmoy,
    };
    const chain = chainNameMap[networkInfo.chain] || viemChains.base;
    const account = privateKeyToAccount(adminKey);
    
    const publicClient = createPublicClient({
      chain,
      transport: http(),
    });

    const [blockNumber, balance] = await Promise.all([
      publicClient.getBlockNumber(),
      publicClient.getBalance({ address: account.address }),
    ]);

    const { formatEther } = await import('viem');
    const ethBalance = formatEther(balance);

    return { 
      message: `Token deploy ready (${networkInfo.chain})`,
      network: networkInfo.chain,
      deployChain: networkInfo.deployChain,
      walletAddress: account.address,
      balance: `${ethBalance} ETH`,
      latestBlock: Number(blockNumber),
    };
  } catch (error) {
    throw new Error(`Token deploy error: ${error.message}`);
  }
}

const HOOK_CONSTANTS = {
  CREATE2_DEPLOYER: '0x4e59b44847b379578588920cA78FbF26c0B4956C',
  POOL_MANAGERS: {
    base: '0x498581ff718922c3f8e6a244956af099b2652b2b',
    'base-sepolia': '0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408',
    arbitrum: '0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32',
    'arbitrum-sepolia': '0xFB3e0C6F74eB1a21CC1Da29aeC80D2Dfe6C9a317',
  },
  CHAINS: {
    base: base,
    'base-sepolia': baseSepolia,
    arbitrum: arbitrum,
    'arbitrum-sepolia': arbitrumSepolia,
  },
  AFTER_INITIALIZE_FLAG: 1n << 12n,
  BEFORE_SWAP_FLAG: 1n << 7n,
  AFTER_SWAP_FLAG: 1n << 6n,
  AFTER_SWAP_RETURNS_DELTA_FLAG: 1n << 2n,
  ALL_FLAGS_MASK: (1n << 14n) - 1n,
};

HOOK_CONSTANTS.REQUIRED_FLAGS = HOOK_CONSTANTS.AFTER_INITIALIZE_FLAG | HOOK_CONSTANTS.BEFORE_SWAP_FLAG | HOOK_CONSTANTS.AFTER_SWAP_FLAG | HOOK_CONSTANTS.AFTER_SWAP_RETURNS_DELTA_FLAG;

function resolveChainConfig(chainParam) {
  const defaultChain = USE_TESTNET ? 'base-sepolia' : 'base';
  const chainKey = chainParam || defaultChain;
  const chain = HOOK_CONSTANTS.CHAINS[chainKey];
  const poolManager = HOOK_CONSTANTS.POOL_MANAGERS[chainKey];
  if (!chain || !poolManager) {
    throw new Error(`Unsupported chain: ${chainKey}. Options: ${Object.keys(HOOK_CONSTANTS.CHAINS).join(', ')}`);
  }
  return { chain, poolManager, chainKey };
}

function mineCreate2Salt(deployerAddress, initCodeHash, maxAttempts = 5000000) {
  const deployerBytes = Buffer.from(deployerAddress.slice(2), 'hex');
  const initCodeHashBytes = Buffer.from(initCodeHash.slice(2), 'hex');

  for (let i = 0; i < maxAttempts; i++) {
    const saltHex = i.toString(16).padStart(64, '0');
    const saltBytes = Buffer.from(saltHex, 'hex');
    const data = Buffer.concat([Buffer.from([0xff]), deployerBytes, saltBytes, initCodeHashBytes]);
    const hash = keccak256(`0x${data.toString('hex')}`);
    const address = `0x${hash.slice(26)}`;
    const addrFlags = BigInt(address) & HOOK_CONSTANTS.ALL_FLAGS_MASK;
    if (addrFlags === HOOK_CONSTANTS.REQUIRED_FLAGS) {
      return { salt: `0x${saltHex}`, address };
    }
  }
  throw new Error(`Could not find valid salt after ${maxAttempts} attempts`);
}

router.get('/hook-status', async (req, res) => {
  try {
    const existingAddress = process.env.MOLT_FEE_ROUTER_ADDRESS;
    const adminKey = process.env.ADMIN_WALLET_PRIVATE_KEY;
    const { chain, poolManager, chainKey } = resolveChainConfig(req.query.chain);

    const result = {
      deployed: false,
      address: existingAddress || null,
      chain: chain.name,
      chainKey,
      poolManager,
      walletAddress: null,
      walletBalance: null,
      canDeploy: false,
    };

    if (adminKey) {
      const formattedKey = adminKey.startsWith('0x') ? adminKey : `0x${adminKey}`;
      const account = privateKeyToAccount(formattedKey);
      result.walletAddress = account.address;

      const publicClient = createPublicClient({ chain, transport: http() });
      const balance = await publicClient.getBalance({ address: account.address });
      result.walletBalance = formatEther(balance);
      result.canDeploy = balance >= 1000000000000000n;
    }

    if (existingAddress) {
      const publicClient = createPublicClient({ chain, transport: http() });
      const code = await publicClient.getCode({ address: existingAddress });
      result.deployed = code && code !== '0x';
      result.codeSize = code ? (code.length / 2 - 1) : 0;
    }

    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/deploy-hook', async (req, res) => {
  try {
    const adminKey = process.env.ADMIN_WALLET_PRIVATE_KEY;
    if (!adminKey) {
      return res.status(400).json({ success: false, error: 'ADMIN_WALLET_PRIVATE_KEY not set' });
    }

    const targetChain = req.body?.chain;
    const { chain, poolManager, chainKey } = resolveChainConfig(targetChain);

    const formattedKey = adminKey.startsWith('0x') ? adminKey : `0x${adminKey}`;
    const account = privateKeyToAccount(formattedKey);

    const publicClient = createPublicClient({ chain, transport: http() });
    const walletClient = createWalletClient({ account, chain, transport: http() });

    const balance = await publicClient.getBalance({ address: account.address });
    if (balance < 1000000000000000n) {
      return res.status(400).json({
        success: false,
        error: 'Insufficient balance',
        walletAddress: account.address,
        balance: formatEther(balance),
        needed: '0.001 ETH minimum',
        chain: chain.name,
      });
    }

    const artifactPath = path.join(__dirname, '../../../contracts/out/MoltFeeRouter.sol/MoltFeeRouter.json');
    if (!fs.existsSync(artifactPath)) {
      return res.status(400).json({
        success: false,
        error: 'Contract not compiled. Run: cd contracts && forge build',
      });
    }

    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    const bytecode = artifact.bytecode.object;

    const constructorArgs = encodeAbiParameters(
      parseAbiParameters('address, address'),
      [poolManager, account.address]
    );

    const initCode = concat([bytecode, constructorArgs]);
    const initCodeHash = keccak256(initCode);

    console.log(`[deploy-hook] Mining CREATE2 salt for ${chain.name} with PoolManager ${poolManager}...`);
    const { salt, address: expectedAddress } = mineCreate2Salt(HOOK_CONSTANTS.CREATE2_DEPLOYER, initCodeHash);
    console.log(`[deploy-hook] Found salt, expected address: ${expectedAddress}`);

    const existingCode = await publicClient.getCode({ address: expectedAddress });
    if (existingCode && existingCode !== '0x') {
      return res.json({
        success: true,
        alreadyDeployed: true,
        address: expectedAddress,
        chain: chain.name,
        chainKey,
        poolManager,
        message: 'Hook already deployed at this address',
      });
    }

    console.log(`[deploy-hook] Deploying MoltFeeRouter to ${chain.name}...`);
    const deployData = concat([salt, initCode]);
    const hash = await walletClient.sendTransaction({
      to: HOOK_CONSTANTS.CREATE2_DEPLOYER,
      data: deployData,
      gas: 5000000n,
    });

    console.log(`[deploy-hook] Transaction sent: ${hash}, waiting for receipt...`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });

    if (receipt.status === 'success') {
      const code = await publicClient.getCode({ address: expectedAddress });
      const verified = code && code !== '0x';

      console.log(`[deploy-hook] Deployed at ${expectedAddress}, verified: ${verified}`);
      res.json({
        success: true,
        address: expectedAddress,
        chain: chain.name,
        chainKey,
        poolManager,
        txHash: hash,
        blockNumber: Number(receipt.blockNumber),
        gasUsed: Number(receipt.gasUsed),
        verified,
        envVar: `MOLT_FEE_ROUTER_ADDRESS=${expectedAddress}`,
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Transaction failed',
        txHash: hash,
        chain: chain.name,
      });
    }
  } catch (error) {
    console.error('[deploy-hook] Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

function getHint(name) {
  const hints = {
    flyio: 'Get token from fly.io dashboard and add as FLY_API_TOKEN secret',
    privy: 'Set VITE_PRIVY_APP_ID and PRIVY_APP_SECRET from privy.io dashboard',
    openrouter: 'Get API key from openrouter.ai and add as OPENROUTER_API_KEY secret',
    token_deploy: 'Set ADMIN_WALLET_PRIVATE_KEY (for signing). Set DEPLOY_CHAIN to target chain (base, ethereum, arbitrum, optimism, polygon).',
  };
  return hints[name] || 'Check configuration';
}

export default router;
