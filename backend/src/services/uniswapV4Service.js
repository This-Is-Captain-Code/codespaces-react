import { createPublicClient, createWalletClient, http, formatEther, parseEther, getAddress, encodeAbiParameters, encodePacked, maxUint128 } from 'viem';
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
    positionManager: '0x7c5f5a4bbd8fd63184577525326123b519429bdc',
    positionManagerTestnet: '0xC81462Fec8B23319F288047f8A03A57682a35C1A',
    permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
    weth: '0x4200000000000000000000000000000000000006',
    wethTestnet: '0x4200000000000000000000000000000000000006',
  },
  arbitrum: {
    mainnet: arbitrum,
    testnet: arbitrumSepolia,
    poolManager: '0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32',
    poolManagerTestnet: '0xFB3e0C6F74eB1a21CC1Da29aeC80D2Dfe6C9a317',
    positionManager: '0xd88f38f930b7952f2db2432cb002e7abbf3dd869',
    positionManagerTestnet: '0xC81462Fec8B23319F288047f8A03A57682a35C1A',
    permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
    weth: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    wethTestnet: '0x980B62Da83eFf3D4576C647993b0c1D7faf17c73',
  },
};

const PRIMARY_CHAIN = 'arbitrum';

const MOLT_FEE_ROUTER_ADDRESS = process.env.MOLT_FEE_ROUTER_ADDRESS || null;

const getChainConfig = (chainName = PRIMARY_CHAIN) => CHAIN_CONFIG[chainName] || CHAIN_CONFIG.arbitrum;
const getChain = (chainName = PRIMARY_CHAIN) => USE_TESTNET ? getChainConfig(chainName).testnet : getChainConfig(chainName).mainnet;
const getPoolManager = (chainName = PRIMARY_CHAIN) => USE_TESTNET ? getChainConfig(chainName).poolManagerTestnet : getChainConfig(chainName).poolManager;
const getPositionManager = (chainName = PRIMARY_CHAIN) => USE_TESTNET ? getChainConfig(chainName).positionManagerTestnet : getChainConfig(chainName).positionManager;
const getPermit2 = (chainName = PRIMARY_CHAIN) => getChainConfig(chainName).permit2;
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

const POSITION_MANAGER_ABI = [
  {
    inputs: [
      { name: 'unlockData', type: 'bytes' },
      { name: 'deadline', type: 'uint256' },
    ],
    name: 'modifyLiquidities',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'ownerOf',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'nextTokenId',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
];

const ACTIONS = {
  MINT_POSITION: 0x00,
  INCREASE_LIQUIDITY: 0x01,
  DECREASE_LIQUIDITY: 0x02,
  BURN_POSITION: 0x03,
  SETTLE_PAIR: 0x09,
  TAKE_PAIR: 0x0a,
  CLOSE_CURRENCY: 0x12,
  SWEEP: 0x13,
};

const PERMIT2_ABI = [
  {
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint160' },
      { name: 'expiration', type: 'uint48' },
    ],
    name: 'approve',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
];

const ERC20_APPROVE_ABI = [
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
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
    positionManager: getPositionManager(chainName),
    permit2: getPermit2(chainName),
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

  addLiquidity: async ({ tokenAddress, amount, chainName = PRIMARY_CHAIN, hookAddress, tickLower = -887220, tickUpper = 887220 }) => {
    console.log(`[Uniswap V4] Adding liquidity: ${amount} to pool for ${tokenAddress} on ${chainName} (testnet: ${USE_TESTNET})`);

    const chain = getChain(chainName);
    const hook = hookAddress || MOLT_FEE_ROUTER_ADDRESS;
    const positionManagerAddr = getPositionManager(chainName);
    const permit2Addr = getPermit2(chainName);

    if (!hook) {
      throw new Error('No hook address configured. Set MOLT_FEE_ROUTER_ADDRESS or pass hookAddress.');
    }

    if (!ADMIN_WALLET_PRIVATE_KEY) {
      throw new Error('ADMIN_WALLET_PRIVATE_KEY not configured - cannot sign transactions');
    }

    const zeroAddr = '0x0000000000000000000000000000000000000000';
    if (!tokenAddress || tokenAddress === zeroAddr) {
      throw new Error('Valid ERC-20 token address required for liquidity provisioning. Deploy a token first.');
    }

    try {
      const account = privateKeyToAccount(ADMIN_WALLET_PRIVATE_KEY);
      const publicClient = createPublicClient({ chain, transport: http() });
      const walletClient = createWalletClient({ account, chain, transport: http() });

      const poolKey = buildPoolKey(tokenAddress, hook, chainName);
      const tokenAmount = parseEther(amount);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

      const weth = getWETH(chainName);
      const isToken0 = BigInt(getAddress(tokenAddress)) < BigInt(getAddress(weth));
      const tokenToApprove = getAddress(tokenAddress);

      const tokenApprovalTx = await walletClient.writeContract({
        address: tokenToApprove,
        abi: ERC20_APPROVE_ABI,
        functionName: 'approve',
        args: [permit2Addr, tokenAmount * 2n],
      });
      await publicClient.waitForTransactionReceipt({ hash: tokenApprovalTx });
      console.log(`[Uniswap V4] Token approved to Permit2`);

      const wethApprovalTx = await walletClient.writeContract({
        address: getAddress(weth),
        abi: ERC20_APPROVE_ABI,
        functionName: 'approve',
        args: [permit2Addr, tokenAmount * 2n],
      });
      await publicClient.waitForTransactionReceipt({ hash: wethApprovalTx });
      console.log(`[Uniswap V4] WETH approved to Permit2`);

      const permit2Expiry = BigInt(Math.floor(Date.now() / 1000) + 86400 * 30);
      const maxPermit2Amount = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF');

      const permit2TokenTx = await walletClient.writeContract({
        address: permit2Addr,
        abi: PERMIT2_ABI,
        functionName: 'approve',
        args: [tokenToApprove, getAddress(positionManagerAddr), maxPermit2Amount, permit2Expiry],
      });
      await publicClient.waitForTransactionReceipt({ hash: permit2TokenTx });

      const permit2WethTx = await walletClient.writeContract({
        address: permit2Addr,
        abi: PERMIT2_ABI,
        functionName: 'approve',
        args: [getAddress(weth), getAddress(positionManagerAddr), maxPermit2Amount, permit2Expiry],
      });
      await publicClient.waitForTransactionReceipt({ hash: permit2WethTx });
      console.log(`[Uniswap V4] Permit2 approved for both tokens to PositionManager`);

      const poolKeyTuple = {
        currency0: poolKey.currency0,
        currency1: poolKey.currency1,
        fee: poolKey.fee,
        tickSpacing: poolKey.tickSpacing,
        hooks: poolKey.hooks,
      };

      const mintParams = encodeAbiParameters(
        [
          { name: 'poolKey', type: 'tuple', components: [
            { name: 'currency0', type: 'address' },
            { name: 'currency1', type: 'address' },
            { name: 'fee', type: 'uint24' },
            { name: 'tickSpacing', type: 'int24' },
            { name: 'hooks', type: 'address' },
          ]},
          { name: 'tickLower', type: 'int24' },
          { name: 'tickUpper', type: 'int24' },
          { name: 'liquidity', type: 'uint256' },
          { name: 'amount0Max', type: 'uint128' },
          { name: 'amount1Max', type: 'uint128' },
          { name: 'owner', type: 'address' },
          { name: 'hookData', type: 'bytes' },
        ],
        [
          poolKeyTuple,
          tickLower,
          tickUpper,
          tokenAmount,
          tokenAmount * 2n,
          tokenAmount * 2n,
          account.address,
          '0x',
        ]
      );

      const settleParams = encodeAbiParameters(
        [
          { name: 'currency0', type: 'address' },
          { name: 'currency1', type: 'address' },
        ],
        [poolKey.currency0, poolKey.currency1]
      );

      const actions = encodePacked(
        ['uint8', 'uint8'],
        [ACTIONS.MINT_POSITION, ACTIONS.SETTLE_PAIR]
      );

      const params = [mintParams, settleParams];

      const unlockData = encodeAbiParameters(
        [
          { name: 'actions', type: 'bytes' },
          { name: 'params', type: 'bytes[]' },
        ],
        [actions, params]
      );

      const txHash = await walletClient.writeContract({
        address: getAddress(positionManagerAddr),
        abi: POSITION_MANAGER_ABI,
        functionName: 'modifyLiquidities',
        args: [unlockData, deadline],
        value: 0n,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      console.log(`[Uniswap V4] Liquidity minted via PositionManager in block ${receipt.blockNumber}`);

      return {
        success: true,
        testnet: USE_TESTNET,
        chain: chain.name,
        chainId: chain.id,
        tokenAddress,
        amount,
        poolKey,
        hookAddress: hook,
        positionManager: positionManagerAddr,
        txHash,
        blockNumber: Number(receipt.blockNumber),
      };
    } catch (error) {
      console.error('[Uniswap V4] Add liquidity failed:', error.message);
      throw new Error(`Add liquidity failed on ${chain.name}: ${error.message}`);
    }
  },

  removeLiquidity: async ({ tokenAddress, amount, chainName = PRIMARY_CHAIN, hookAddress, tokenId }) => {
    console.log(`[Uniswap V4] Removing liquidity: ${amount} from pool for ${tokenAddress} on ${chainName} (testnet: ${USE_TESTNET})`);

    const chain = getChain(chainName);
    const hook = hookAddress || MOLT_FEE_ROUTER_ADDRESS;
    const positionManagerAddr = getPositionManager(chainName);

    if (!hook) {
      throw new Error('No hook address configured');
    }

    if (!ADMIN_WALLET_PRIVATE_KEY) {
      throw new Error('ADMIN_WALLET_PRIVATE_KEY not configured');
    }

    if (!tokenId) {
      throw new Error('tokenId is required for removeLiquidity - pass the NFT position ID');
    }

    try {
      const account = privateKeyToAccount(ADMIN_WALLET_PRIVATE_KEY);
      const publicClient = createPublicClient({ chain, transport: http() });
      const walletClient = createWalletClient({ account, chain, transport: http() });

      const poolKey = buildPoolKey(tokenAddress, hook, chainName);
      const liquidityAmount = parseEther(amount);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

      const decreaseParams = encodeAbiParameters(
        [
          { name: 'tokenId', type: 'uint256' },
          { name: 'liquidity', type: 'uint256' },
          { name: 'amount0Min', type: 'uint128' },
          { name: 'amount1Min', type: 'uint128' },
          { name: 'hookData', type: 'bytes' },
        ],
        [BigInt(tokenId), liquidityAmount, 0n, 0n, '0x']
      );

      const takeParams = encodeAbiParameters(
        [
          { name: 'currency0', type: 'address' },
          { name: 'currency1', type: 'address' },
          { name: 'recipient', type: 'address' },
        ],
        [poolKey.currency0, poolKey.currency1, account.address]
      );

      const actions = encodePacked(
        ['uint8', 'uint8'],
        [ACTIONS.DECREASE_LIQUIDITY, ACTIONS.TAKE_PAIR]
      );

      const params = [decreaseParams, takeParams];

      const unlockData = encodeAbiParameters(
        [
          { name: 'actions', type: 'bytes' },
          { name: 'params', type: 'bytes[]' },
        ],
        [actions, params]
      );

      const txHash = await walletClient.writeContract({
        address: getAddress(positionManagerAddr),
        abi: POSITION_MANAGER_ABI,
        functionName: 'modifyLiquidities',
        args: [unlockData, deadline],
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      console.log(`[Uniswap V4] Liquidity removed in block ${receipt.blockNumber}`);

      return {
        success: true,
        testnet: USE_TESTNET,
        chain: chain.name,
        tokenAddress,
        amount,
        tokenId,
        positionManager: positionManagerAddr,
        txHash,
        blockNumber: Number(receipt.blockNumber),
      };
    } catch (error) {
      console.error('[Uniswap V4] Remove liquidity failed:', error.message);
      throw new Error(`Remove liquidity failed on ${chain.name}: ${error.message}`);
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
