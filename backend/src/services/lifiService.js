import { createPublicClient, http, formatEther, parseEther } from 'viem';
import { base, arbitrum, mainnet, optimism, polygon } from 'viem/chains';

const USE_TESTNET = process.env.USE_TESTNET === 'true';
const LIFI_API_KEY = process.env.LIFI_API_KEY || null;
const LIFI_API_BASE = 'https://li.quest/v1';

const CHAIN_ID_MAP = {
  base: 8453,
  arbitrum: 42161,
  ethereum: 1,
  optimism: 10,
  polygon: 137,
};

const CHAIN_NATIVE_TOKEN = '0x0000000000000000000000000000000000000000';

const USDC_ADDRESSES = {
  base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  arbitrum: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  ethereum: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  optimism: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
  polygon: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
};

export const lifiService = {
  isConfigured: () => {
    if (USE_TESTNET) return true;
    return true;
  },

  isSimulated: () => USE_TESTNET,

  getStatus: () => ({
    configured: lifiService.isConfigured(),
    simulated: lifiService.isSimulated(),
    apiBase: LIFI_API_BASE,
    hasApiKey: !!LIFI_API_KEY,
    supportedChains: Object.keys(CHAIN_ID_MAP),
  }),

  getSupportedChains: async () => {
    if (USE_TESTNET) {
      return Object.entries(CHAIN_ID_MAP).map(([name, id]) => ({ name, chainId: id }));
    }

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
    console.log(`[LI.FI] Getting quote: ${fromChain} -> ${toChain}, amount: ${fromAmount}`);

    const fromChainId = CHAIN_ID_MAP[fromChain];
    const toChainId = CHAIN_ID_MAP[toChain];

    if (!fromChainId || !toChainId) {
      throw new Error(`Unsupported chain: ${fromChain} or ${toChain}`);
    }

    if (USE_TESTNET) {
      return lifiService._simulateQuote({ fromChain, toChain, fromToken, toToken, fromAmount, fromAddress, fromChainId, toChainId });
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
        const errorText = await response.text();
        throw new Error(`LI.FI API error (${response.status}): ${errorText}`);
      }

      const quote = await response.json();

      return {
        simulated: false,
        routeId: quote.id || `lifi_${Date.now()}`,
        fromChain,
        toChain,
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
      console.error('[LI.FI] Quote failed:', error.message);
      throw error;
    }
  },

  executeRoute: async ({ quote, walletClient }) => {
    console.log(`[LI.FI] Executing route ${quote.routeId}`);

    if (quote.simulated || USE_TESTNET) {
      return lifiService._simulateExecution(quote);
    }

    if (!quote.transactionRequest) {
      throw new Error('No transaction request in quote');
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
        simulated: false,
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

    if (USE_TESTNET) {
      return {
        simulated: true,
        status: 'DONE',
        substatus: 'COMPLETED',
        fromChain,
        toChain,
        txHash,
        receivingTxHash: `0x${'done'.repeat(16)}`,
      };
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
        simulated: false,
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

  _simulateQuote: ({ fromChain, toChain, fromToken, toToken, fromAmount, fromAddress, fromChainId, toChainId }) => {
    const slippage = 0.003;
    const gasCost = '0.50';
    const estimatedOutput = (parseFloat(fromAmount) * (1 - slippage)).toString();

    return {
      simulated: true,
      routeId: `sim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      fromChain,
      toChain,
      fromChainId,
      toChainId,
      fromToken: fromToken || 'ETH',
      toToken: toToken || 'ETH',
      fromAmount,
      toAmount: estimatedOutput,
      toAmountMin: (parseFloat(estimatedOutput) * 0.995).toString(),
      gasCostUsd: gasCost,
      bridgeUsed: 'stargate (simulated)',
      estimatedTime: 120,
      transactionRequest: null,
    };
  },

  _simulateExecution: (quote) => {
    const mockTxHash = `0x${Date.now().toString(16).padStart(64, '0')}`;

    return {
      simulated: true,
      routeId: quote.routeId,
      txHash: mockTxHash,
      status: 'DONE',
      fromChain: quote.fromChain,
      toChain: quote.toChain,
      amountReceived: quote.toAmount,
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
