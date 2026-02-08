import { createPublicClient, createWalletClient, http, formatEther, parseEther, getAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base, baseSepolia, arbitrum, arbitrumSepolia } from 'viem/chains';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const USE_TESTNET = process.env.USE_TESTNET === 'true';
const ADMIN_WALLET_PRIVATE_KEY = process.env.ADMIN_WALLET_PRIVATE_KEY;
const MOLT_REWARD_ADDRESS = process.env.MOLT_REWARD_ADDRESS || '0x0000000000000000000000000000000000000000';

const CHAIN_CONFIG = {
  base: {
    mainnet: base,
    testnet: baseSepolia,
    poolManager: '0x498581ff718922c3f8e6a244956af099b2652b2b',
    poolManagerTestnet: '0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408',
    weth: '0x4200000000000000000000000000000000000006',
    wethTestnet: '0x4200000000000000000000000000000000000006',
  },
  arbitrum: {
    mainnet: arbitrum,
    testnet: arbitrumSepolia,
    poolManager: '0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32',
    poolManagerTestnet: '0xFB3e0C6F74eB1a21CC1Da29aeC80D2Dfe6C9a317',
    weth: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    wethTestnet: '0x980B62Da83eFf3D4576C647993b0c1D7faf17c73',
  },
};

const PRIMARY_CHAIN = 'arbitrum';

const MOLT_FEE_ROUTER_ADDRESS = process.env.MOLT_FEE_ROUTER_ADDRESS || null;

const getChainConfig = (chainName = PRIMARY_CHAIN) => CHAIN_CONFIG[chainName] || CHAIN_CONFIG.arbitrum;
const getChain = (chainName = PRIMARY_CHAIN) => USE_TESTNET ? getChainConfig(chainName).testnet : getChainConfig(chainName).mainnet;
const getPoolManager = (chainName = PRIMARY_CHAIN) => USE_TESTNET ? getChainConfig(chainName).poolManagerTestnet : getChainConfig(chainName).poolManager;
const getWETH = (chainName = PRIMARY_CHAIN) => USE_TESTNET ? getChainConfig(chainName).wethTestnet : getChainConfig(chainName).weth;

let MOLT_FEE_ROUTER_ABI;
try {
  const abiPath = join(__dirname, '..', '..', '..', 'contracts', 'abi', 'MoltFeeRouter.json');
  MOLT_FEE_ROUTER_ABI = JSON.parse(readFileSync(abiPath, 'utf8'));
} catch (e) {
  console.warn('MoltFeeRouter ABI not found, using embedded ABI');
  MOLT_FEE_ROUTER_ABI = [];
}

const POOL_MANAGER_ABI = [
  {
    inputs: [{ name: 'id', type: 'bytes32' }],
    name: 'getLiquidity',
    outputs: [{ name: '', type: 'uint128' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'id', type: 'bytes32' }, { name: 'tick', type: 'int24' }],
    name: 'getTickLiquidity',
    outputs: [{ name: '', type: 'uint128' }],
    stateMutability: 'view',
    type: 'function',
  },
];

function sortCurrencies(tokenAddress, chainName = PRIMARY_CHAIN) {
  const weth = getWETH(chainName);
  const token = getAddress(tokenAddress);
  const wethAddr = getAddress(weth);

  if (BigInt(token) < BigInt(wethAddr)) {
    return { currency0: token, currency1: wethAddr };
  }
  return { currency0: wethAddr, currency1: token };
}

function buildPoolKey(tokenAddress, hookAddress, chainName = PRIMARY_CHAIN) {
  const { currency0, currency1 } = sortCurrencies(tokenAddress, chainName);
  return {
    currency0,
    currency1,
    fee: 3000,
    tickSpacing: 60,
    hooks: hookAddress || MOLT_FEE_ROUTER_ADDRESS || '0x0000000000000000000000000000000000000000',
  };
}

function getPublicClient(chainName = PRIMARY_CHAIN) {
  const chain = getChain(chainName);
  return createPublicClient({ chain, transport: http() });
}

function getWalletClientIfConfigured(chainName = PRIMARY_CHAIN) {
  if (!ADMIN_WALLET_PRIVATE_KEY) return null;
  const chain = getChain(chainName);
  const account = privateKeyToAccount(ADMIN_WALLET_PRIVATE_KEY);
  return createWalletClient({ account, chain, transport: http() });
}

export const uniswapV4Service = {
  isConfigured: () => {
    if (USE_TESTNET) return true;
    return !!ADMIN_WALLET_PRIVATE_KEY && !!MOLT_FEE_ROUTER_ADDRESS;
  },

  isTestnet: () => USE_TESTNET,

  getHookAddress: () => MOLT_FEE_ROUTER_ADDRESS,

  getPrimaryChain: () => PRIMARY_CHAIN,

  getSupportedChains: () => Object.keys(CHAIN_CONFIG),

  getNetworkInfo: (chainName) => ({
    isTestnet: USE_TESTNET,
    chain: getChain(chainName).name,
    chainId: getChain(chainName).id,
    poolManager: getPoolManager(chainName),
    hookAddress: MOLT_FEE_ROUTER_ADDRESS,
    weth: getWETH(chainName),
    primaryChain: PRIMARY_CHAIN,
  }),

  registerPool: async ({ tokenAddress, agentTreasuryAddress, developerAddress, tokenAdminAddress }) => {
    if (!ADMIN_WALLET_PRIVATE_KEY) {
      throw new Error('ADMIN_WALLET_PRIVATE_KEY not configured');
    }

    if (!MOLT_FEE_ROUTER_ADDRESS) {
      console.warn('MOLT_FEE_ROUTER_ADDRESS not configured, skipping hook registration');
      return {
        registered: false,
        reason: 'Hook contract not deployed',
        testnet: USE_TESTNET,
      };
    }

    const chain = getChain();
    console.log(`Registering pool on MoltFeeRouter for token ${tokenAddress} on ${chain.name}...`);

    try {
      const account = privateKeyToAccount(ADMIN_WALLET_PRIVATE_KEY);
      const publicClient = createPublicClient({ chain, transport: http() });
      const walletClient = createWalletClient({ account, chain, transport: http() });

      const poolKey = buildPoolKey(tokenAddress, MOLT_FEE_ROUTER_ADDRESS);

      const txHash = await walletClient.writeContract({
        address: MOLT_FEE_ROUTER_ADDRESS,
        abi: MOLT_FEE_ROUTER_ABI,
        functionName: 'registerPool',
        args: [
          poolKey,
          agentTreasuryAddress,
          developerAddress || agentTreasuryAddress,
          MOLT_REWARD_ADDRESS,
          tokenAdminAddress,
        ],
      });

      console.log(`Hook pool registration tx: ${txHash}`);

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      console.log(`Hook pool registered in block ${receipt.blockNumber}`);

      return {
        registered: true,
        testnet: USE_TESTNET,
        txHash,
        poolKey,
        hookAddress: MOLT_FEE_ROUTER_ADDRESS,
        tokenAddress,
        blockNumber: Number(receipt.blockNumber),
      };
    } catch (error) {
      console.error('Hook pool registration failed:', error);
      throw new Error(`Hook pool registration failed: ${error.message}`);
    }
  },

  setFeeMode: async ({ tokenAddress, feeMode, walletId }) => {
    const modeMap = { conservative: 0, balanced: 1, aggressive: 2 };
    const modeValue = modeMap[feeMode.toLowerCase()];
    if (modeValue === undefined) {
      throw new Error(`Invalid fee mode: ${feeMode}. Must be: conservative, balanced, aggressive`);
    }

    if (!MOLT_FEE_ROUTER_ADDRESS) {
      throw new Error('MOLT_FEE_ROUTER_ADDRESS not configured');
    }

    const chain = getChain();
    const account = privateKeyToAccount(ADMIN_WALLET_PRIVATE_KEY);
    const walletClient = createWalletClient({ account, chain, transport: http() });
    const poolKey = buildPoolKey(tokenAddress, MOLT_FEE_ROUTER_ADDRESS);

    const txHash = await walletClient.writeContract({
      address: MOLT_FEE_ROUTER_ADDRESS,
      abi: MOLT_FEE_ROUTER_ABI,
      functionName: 'setFeeMode',
      args: [poolKey, modeValue],
    });

    return { success: true, testnet: USE_TESTNET, txHash, feeMode, modeValue };
  },

  setAgentShare: async ({ tokenAddress, shareBps }) => {
    if (shareBps < 200 || shareBps > 5000) {
      throw new Error('Agent share must be between 200 (2%) and 5000 (50%) BPS');
    }

    if (!MOLT_FEE_ROUTER_ADDRESS) {
      throw new Error('MOLT_FEE_ROUTER_ADDRESS not configured');
    }

    const chain = getChain();
    const account = privateKeyToAccount(ADMIN_WALLET_PRIVATE_KEY);
    const walletClient = createWalletClient({ account, chain, transport: http() });
    const poolKey = buildPoolKey(tokenAddress, MOLT_FEE_ROUTER_ADDRESS);

    const txHash = await walletClient.writeContract({
      address: MOLT_FEE_ROUTER_ADDRESS,
      abi: MOLT_FEE_ROUTER_ABI,
      functionName: 'setAgentShare',
      args: [poolKey, shareBps],
    });

    return { success: true, testnet: USE_TESTNET, txHash, shareBps };
  },

  getPoolAnalytics: async (tokenAddress) => {
    if (!MOLT_FEE_ROUTER_ADDRESS) {
      return {
        configured: false,
        testnet: USE_TESTNET,
        reason: 'Hook contract not deployed. Set MOLT_FEE_ROUTER_ADDRESS to enable pool analytics.',
      };
    }

    const chain = getChain();

    try {
      const publicClient = createPublicClient({ chain, transport: http() });
      const poolKey = buildPoolKey(tokenAddress, MOLT_FEE_ROUTER_ADDRESS);
      const weth = getWETH();

      const [config, currentFee, currentSplit, volumeInfo, fees] = await Promise.all([
        publicClient.readContract({
          address: MOLT_FEE_ROUTER_ADDRESS,
          abi: MOLT_FEE_ROUTER_ABI,
          functionName: 'getPoolConfig',
          args: [poolKey],
        }),
        publicClient.readContract({
          address: MOLT_FEE_ROUTER_ADDRESS,
          abi: MOLT_FEE_ROUTER_ABI,
          functionName: 'getCurrentFee',
          args: [poolKey],
        }),
        publicClient.readContract({
          address: MOLT_FEE_ROUTER_ADDRESS,
          abi: MOLT_FEE_ROUTER_ABI,
          functionName: 'getCurrentSplit',
          args: [poolKey],
        }),
        publicClient.readContract({
          address: MOLT_FEE_ROUTER_ADDRESS,
          abi: MOLT_FEE_ROUTER_ABI,
          functionName: 'getVolumeData',
          args: [poolKey],
        }),
        publicClient.readContract({
          address: MOLT_FEE_ROUTER_ADDRESS,
          abi: MOLT_FEE_ROUTER_ABI,
          functionName: 'getAccruedFees',
          args: [poolKey, weth],
        }),
      ]);

      const feeModes = ['conservative', 'balanced', 'aggressive'];
      const poolAge = Math.floor(Date.now() / 1000) - Number(config.createdAt);
      let poolPhase = 'mature';
      if (poolAge < 7 * 86400) poolPhase = 'early';
      else if (poolAge < 30 * 86400) poolPhase = 'growth';

      return {
        configured: true,
        testnet: USE_TESTNET,
        tokenAddress,
        hookAddress: MOLT_FEE_ROUTER_ADDRESS,
        currentFee: Number(currentFee),
        currentSplit: {
          agentBps: Number(currentSplit[0]),
          devBps: Number(currentSplit[1]),
          platformBps: Number(currentSplit[2]),
          adminBps: Number(currentSplit[3]),
        },
        volume: {
          dailyVolume: formatEther(volumeInfo.dailyVolume),
          lastReset: new Date(Number(volumeInfo.lastResetTimestamp) * 1000).toISOString(),
        },
        accruedFees: {
          agentFees: formatEther(fees.agentFees),
          devFees: formatEther(fees.devFees),
          platformFees: formatEther(fees.platformFees),
          adminFees: formatEther(fees.adminFees),
        },
        feeMode: feeModes[config.feeMode] || 'balanced',
        poolAge,
        poolPhase,
        recipients: {
          agentTreasury: config.agentTreasury,
          developer: config.developer,
          platform: config.platform,
          tokenAdmin: config.tokenAdmin,
        },
      };
    } catch (error) {
      console.error('Failed to get pool analytics:', error.message);
      return {
        configured: true,
        testnet: USE_TESTNET,
        error: `Contract call failed: ${error.message}`,
        hookAddress: MOLT_FEE_ROUTER_ADDRESS,
        tokenAddress,
      };
    }
  },

  addLiquidity: async ({ tokenAddress, amount, chainName = PRIMARY_CHAIN, hookAddress }) => {
    console.log(`[Uniswap V4] Adding liquidity: ${amount} to pool for ${tokenAddress} on ${chainName} (testnet: ${USE_TESTNET})`);

    const chain = getChain(chainName);
    const hook = hookAddress || MOLT_FEE_ROUTER_ADDRESS;

    if (!hook) {
      throw new Error('No hook address configured. Set MOLT_FEE_ROUTER_ADDRESS or pass hookAddress.');
    }

    if (!ADMIN_WALLET_PRIVATE_KEY) {
      throw new Error('ADMIN_WALLET_PRIVATE_KEY not configured - cannot sign transactions');
    }

    try {
      const account = privateKeyToAccount(ADMIN_WALLET_PRIVATE_KEY);
      const publicClient = createPublicClient({ chain, transport: http() });
      const walletClient = createWalletClient({ account, chain, transport: http() });

      const poolKey = buildPoolKey(tokenAddress, hook, chainName);

      const txHash = await walletClient.writeContract({
        address: hook,
        abi: MOLT_FEE_ROUTER_ABI,
        functionName: 'addLiquidity',
        args: [poolKey, parseEther(amount)],
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      console.log(`[Uniswap V4] Liquidity added in block ${receipt.blockNumber}`);

      return {
        success: true,
        testnet: USE_TESTNET,
        chain: chain.name,
        chainId: chain.id,
        tokenAddress,
        amount,
        poolKey,
        hookAddress: hook,
        txHash,
        blockNumber: Number(receipt.blockNumber),
      };
    } catch (error) {
      console.error('[Uniswap V4] Add liquidity failed:', error.message);
      throw new Error(`Add liquidity failed on ${chain.name}: ${error.message}`);
    }
  },

  removeLiquidity: async ({ tokenAddress, amount, chainName = PRIMARY_CHAIN, hookAddress }) => {
    console.log(`[Uniswap V4] Removing liquidity: ${amount} from pool for ${tokenAddress} on ${chainName} (testnet: ${USE_TESTNET})`);

    const chain = getChain(chainName);
    const hook = hookAddress || MOLT_FEE_ROUTER_ADDRESS;

    if (!hook) {
      throw new Error('No hook address configured');
    }

    if (!ADMIN_WALLET_PRIVATE_KEY) {
      throw new Error('ADMIN_WALLET_PRIVATE_KEY not configured');
    }

    try {
      const account = privateKeyToAccount(ADMIN_WALLET_PRIVATE_KEY);
      const publicClient = createPublicClient({ chain, transport: http() });
      const walletClient = createWalletClient({ account, chain, transport: http() });

      const poolKey = buildPoolKey(tokenAddress, hook, chainName);

      const txHash = await walletClient.writeContract({
        address: hook,
        abi: MOLT_FEE_ROUTER_ABI,
        functionName: 'removeLiquidity',
        args: [poolKey, parseEther(amount)],
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      console.log(`[Uniswap V4] Liquidity removed in block ${receipt.blockNumber}`);

      return {
        success: true,
        testnet: USE_TESTNET,
        chain: chain.name,
        tokenAddress,
        amount,
        txHash,
        blockNumber: Number(receipt.blockNumber),
      };
    } catch (error) {
      console.error('[Uniswap V4] Remove liquidity failed:', error);
      throw new Error(`Remove liquidity failed: ${error.message}`);
    }
  },

  observePoolState: async ({ tokenAddress, chainName = PRIMARY_CHAIN }) => {
    const chain = getChain(chainName);
    const poolManager = getPoolManager(chainName);

    if (!tokenAddress || tokenAddress === '0x0000000000000000000000000000000000000000') {
      return {
        testnet: USE_TESTNET,
        chain: chain.name,
        chainId: chain.id,
        poolManager,
        tokenAddress: null,
        message: 'No token address configured. Deploy a token first to observe pool state.',
        hookActive: !!MOLT_FEE_ROUTER_ADDRESS,
      };
    }

    if (MOLT_FEE_ROUTER_ADDRESS) {
      try {
        const analytics = await uniswapV4Service.getPoolAnalytics(tokenAddress);
        return {
          testnet: USE_TESTNET,
          chain: chain.name,
          chainId: chain.id,
          poolManager,
          tokenAddress,
          hookActive: true,
          ...analytics,
        };
      } catch (error) {
        console.warn(`[Uniswap V4] Pool analytics failed: ${error.message}`);
      }
    }

    try {
      const publicClient = getPublicClient(chainName);
      const blockNumber = await publicClient.getBlockNumber();

      return {
        testnet: USE_TESTNET,
        chain: chain.name,
        chainId: chain.id,
        poolManager,
        tokenAddress,
        hookActive: !!MOLT_FEE_ROUTER_ADDRESS,
        hookAddress: MOLT_FEE_ROUTER_ADDRESS,
        latestBlock: Number(blockNumber),
        message: MOLT_FEE_ROUTER_ADDRESS
          ? 'Pool analytics query failed - hook may not be registered for this token'
          : 'No MoltFeeRouter deployed. Set MOLT_FEE_ROUTER_ADDRESS to enable full pool analytics.',
      };
    } catch (error) {
      console.error('[Uniswap V4] observePoolState RPC failed:', error.message);
      return {
        testnet: USE_TESTNET,
        chain: chain.name,
        chainId: chain.id,
        poolManager,
        tokenAddress,
        hookActive: false,
        error: `RPC call failed: ${error.message}`,
      };
    }
  },
};
