import { createPublicClient, http, formatEther, parseEther } from 'viem';
import { base, arbitrum, mainnet, optimism, polygon, baseSepolia, arbitrumSepolia, sepolia, optimismSepolia } from 'viem/chains';

const USE_TESTNET = process.env.USE_TESTNET === 'true';
const LIFI_API_KEY = process.env.LIFI_API_KEY || null;
const LIFI_API_BASE = 'https://li.quest/v1';

const MAINNET_CHAIN_IDS = {
  base: 8453,
  arbitrum: 42161,
  ethereum: 1,
  optimism: 10,
  polygon: 137,
};

const TESTNET_CHAIN_IDS = {
  base: 84532,
  arbitrum: 421614,
  ethereum: 11155111,
  optimism: 11155420,
  polygon: 80002,
};

const CHAIN_ID_MAP = USE_TESTNET ? TESTNET_CHAIN_IDS : MAINNET_CHAIN_IDS;

const CHAIN_NATIVE_TOKEN = '0x0000000000000000000000000000000000000000';

const USDC_MAINNET = {
  base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  arbitrum: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  ethereum: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  optimism: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
  polygon: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
};

const USDC_TESTNET = {
  base: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  arbitrum: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
  ethereum: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
  optimism: '0x5fd84259d66Cd46123540766Be93DFE6D43130D7',
  polygon: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582',
};

const USDC_ADDRESSES = USE_TESTNET ? USDC_TESTNET : USDC_MAINNET;

export const lifiService = {
  isConfigured: () => true,

  isTestnet: () => USE_TESTNET,

  getStatus: () => ({
    configured: true,
    testnet: USE_TESTNET,
    apiBase: LIFI_API_BASE,
    hasApiKey: !!LIFI_API_KEY,
    sourceChain: 'base',
    supportedChains: Object.keys(CHAIN_ID_MAP),
    chainIds: CHAIN_ID_MAP,
  }),

  getSupportedChains: async () => {
    try {
      const response = await fetch(`${LIFI_API_BASE}/chains`, {
        headers: lifiService._getHeaders(),
      });
      const data = await response.json();
      return data.chains || [];
    } catch (error) {
      console.error('[LI.FI] Failed to fetch chains:', error.message);
      return Object.entries(CHAIN_ID_MAP).map(([name, id]) => ({ name, chainId: id }));
    }
  },

  getQuote: async ({ fromChain, toChain, fromToken, toToken, fromAmount, fromAddress }) => {
    console.log(`[LI.FI] Getting quote: ${fromChain} -> ${toChain}, amount: ${fromAmount}, testnet: ${USE_TESTNET}`);

    const fromChainId = CHAIN_ID_MAP[fromChain];
    const toChainId = CHAIN_ID_MAP[toChain];

    if (!fromChainId || !toChainId) {
      throw new Error(`Unsupported chain: ${fromChain} or ${toChain}`);
    }

    try {
      const params = new URLSearchParams({
        fromChain: fromChainId.toString(),
        toChain: toChainId.toString(),
        fromToken: fromToken || CHAIN_NATIVE_TOKEN,
        toToken: toToken || CHAIN_NATIVE_TOKEN,
        fromAmount,
        fromAddress,
        integrator: 'molt-town',
      });

      const response = await fetch(`${LIFI_API_BASE}/quote?${params}`, {
        headers: lifiService._getHeaders(),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.warn(`[LI.FI] API returned ${response.status}: ${errorBody}`);

        if (USE_TESTNET && response.status >= 400) {
          console.log('[LI.FI] Testnet chains may not be supported by bridges. Returning testnet-limited quote.');
          return lifiService._testnetFallbackQuote({ fromChain, toChain, fromToken, toToken, fromAmount, fromAddress, fromChainId, toChainId, apiError: errorBody });
        }

        throw new Error(`LI.FI API error (${response.status}): ${errorBody}`);
      }

      const quote = await response.json();

      return {
        testnet: USE_TESTNET,
        routeId: quote.id || `lifi_${Date.now()}`,
        fromChain,
        toChain,
        fromChainId,
        toChainId,
        fromToken: quote.action?.fromToken?.symbol || fromToken,
        toToken: quote.action?.toToken?.symbol || toToken,
        fromAmount: quote.action?.fromAmount || fromAmount,
        toAmount: quote.estimate?.toAmount || '0',
        toAmountMin: quote.estimate?.toAmountMin || '0',
        gasCostUsd: quote.estimate?.gasCosts?.[0]?.amountUSD || '0',
        bridgeUsed: quote.tool || 'unknown',
        estimatedTime: quote.estimate?.executionDuration || 0,
        transactionRequest: quote.transactionRequest || null,
        rawQuote: quote,
      };
    } catch (error) {
      if (USE_TESTNET && !error.message.includes('LI.FI API error')) {
        console.warn('[LI.FI] Testnet quote failed, returning fallback:', error.message);
        return lifiService._testnetFallbackQuote({ fromChain, toChain, fromToken, toToken, fromAmount, fromAddress, fromChainId, toChainId, apiError: error.message });
      }
      console.error('[LI.FI] Quote failed:', error.message);
      throw error;
    }
  },

  executeRoute: async ({ quote, walletClient }) => {
    console.log(`[LI.FI] Executing route ${quote.routeId}, testnet: ${USE_TESTNET}`);

    if (quote.bridgeLimited) {
      console.log('[LI.FI] Testnet bridge not available - cross-chain execution skipped');
      return {
        testnet: true,
        bridgeLimited: true,
        routeId: quote.routeId,
        txHash: null,
        status: 'BRIDGE_UNAVAILABLE',
        message: 'Cross-chain bridges are not available on testnets. Tokens stay on source chain.',
        fromChain: quote.fromChain,
        toChain: quote.toChain,
      };
    }

    if (!quote.transactionRequest) {
      throw new Error('No transaction request in quote - cannot execute route');
    }

    try {
      const txHash = await walletClient.sendTransaction({
        to: quote.transactionRequest.to,
        data: quote.transactionRequest.data,
        value: BigInt(quote.transactionRequest.value || '0'),
        gasLimit: quote.transactionRequest.gasLimit ? BigInt(quote.transactionRequest.gasLimit) : undefined,
      });

      console.log(`[LI.FI] Transaction sent: ${txHash}`);

      return {
        testnet: USE_TESTNET,
        routeId: quote.routeId,
        txHash,
        status: 'pending',
        fromChain: quote.fromChain,
        toChain: quote.toChain,
      };
    } catch (error) {
      console.error('[LI.FI] Execution failed:', error.message);
      throw error;
    }
  },

  trackStatus: async ({ txHash, fromChain, toChain }) => {
    console.log(`[LI.FI] Tracking: ${txHash}`);

    if (!txHash) {
      return { status: 'BRIDGE_UNAVAILABLE', message: 'No transaction to track (testnet bridge limitation)' };
    }

    const fromChainId = CHAIN_ID_MAP[fromChain];

    try {
      const params = new URLSearchParams({
        txHash,
        bridge: 'all',
        fromChain: fromChainId.toString(),
      });

      const response = await fetch(`${LIFI_API_BASE}/status?${params}`, {
        headers: lifiService._getHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Status check failed: ${response.status}`);
      }

      const data = await response.json();

      return {
        testnet: USE_TESTNET,
        status: data.status || 'UNKNOWN',
        substatus: data.substatus || '',
        fromChain,
        toChain,
        txHash,
        receivingTxHash: data.receiving?.txHash || null,
        tool: data.tool || null,
      };
    } catch (error) {
      console.error('[LI.FI] Status check failed:', error.message);
      return { status: 'UNKNOWN', error: error.message };
    }
  },

  _testnetFallbackQuote: ({ fromChain, toChain, fromToken, toToken, fromAmount, fromAddress, fromChainId, toChainId, apiError }) => {
    console.log(`[LI.FI] Generating testnet-limited quote (bridges unavailable between testnets)`);

    return {
      testnet: true,
      bridgeLimited: true,
      routeId: `testnet_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      fromChain,
      toChain,
      fromChainId,
      toChainId,
      fromToken: fromToken || 'ETH',
      toToken: toToken || 'ETH',
      fromAmount,
      toAmount: fromAmount,
      toAmountMin: fromAmount,
      gasCostUsd: '0',
      bridgeUsed: 'none (testnet - bridges unavailable)',
      estimatedTime: 0,
      transactionRequest: null,
      message: `Cross-chain bridges typically don't support testnets. Quote is for reference only.`,
      apiError,
    };
  },

  _getHeaders: () => {
    const headers = { 'Content-Type': 'application/json' };
    if (LIFI_API_KEY) {
      headers['x-lifi-api-key'] = LIFI_API_KEY;
    }
    return headers;
  },

  getUsdcAddress: (chain) => USDC_ADDRESSES[chain] || null,
  getChainId: (chain) => CHAIN_ID_MAP[chain] || null,
};
