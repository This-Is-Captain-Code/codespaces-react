import { createPublicClient, createWalletClient, http, formatEther } from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { base, baseSepolia } from 'viem/chains';

const USE_TESTNET = process.env.USE_TESTNET === 'true';
const ADMIN_WALLET_PRIVATE_KEY = process.env.ADMIN_WALLET_PRIVATE_KEY;
const MOLT_REWARD_ADDRESS = process.env.MOLT_REWARD_ADDRESS || '0x0000000000000000000000000000000000000000';
const DEV_REWARD_ADDRESS = process.env.DEV_REWARD_ADDRESS;

const getChain = () => USE_TESTNET ? baseSepolia : base;
const getExplorerUrl = () => USE_TESTNET ? 'https://sepolia.basescan.org' : 'https://basescan.org';

export const clankerService = {
  isConfigured: () => {
    return !!ADMIN_WALLET_PRIVATE_KEY;
  },

  isTestnet: () => USE_TESTNET,
  
  getNetworkInfo: () => ({
    isTestnet: USE_TESTNET,
    chain: USE_TESTNET ? 'Base Sepolia' : 'Base',
    chainId: USE_TESTNET ? baseSepolia.id : base.id,
    explorerUrl: getExplorerUrl(),
  }),

  generateWallet: () => {
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    return {
      privateKey,
      address: account.address,
    };
  },

  getWalletBalance: async (address) => {
    const publicClient = createPublicClient({
      chain: getChain(),
      transport: http(),
    });
    const balance = await publicClient.getBalance({ address });
    return {
      wei: balance.toString(),
      eth: formatEther(balance),
    };
  },

  deployToken: async (options) => {
    const {
      name,
      symbol,
      tokenAdminAddress,
      agentTreasuryAddress,
      devRewardAddress,
      image,
      description,
    } = options;

    if (!ADMIN_WALLET_PRIVATE_KEY) {
      throw new Error('ADMIN_WALLET_PRIVATE_KEY not configured');
    }

    const chain = getChain();
    console.log(`Deploying Clanker token: ${name} (${symbol}) on ${chain.name}...`);

    if (USE_TESTNET) {
      console.log('TESTNET MODE: Simulating token deployment...');
      const mockAddress = `0x${Date.now().toString(16).padStart(40, '0')}`;
      return {
        tokenAddress: mockAddress,
        txHash: `0x${'test'.repeat(16)}`,
        name,
        symbol,
        tradeUrl: `https://clanker.world/clanker/${mockAddress}`,
        basescanUrl: `${getExplorerUrl()}/token/${mockAddress}`,
        isTestnet: true,
        note: 'Testnet mock - Clanker SDK only works on mainnet',
      };
    }

    try {
      const { Clanker, POOL_POSITIONS, FEE_CONFIGS } = await import('clanker-sdk/v4');

      const account = privateKeyToAccount(ADMIN_WALLET_PRIVATE_KEY);
      
      const publicClient = createPublicClient({
        chain,
        transport: http(),
      });
      
      const walletClient = createWalletClient({
        account,
        chain,
        transport: http(),
      });

      const clanker = new Clanker({
        publicClient,
        wallet: walletClient,
      });

      const tokenConfig = {
        name,
        symbol,
        tokenAdmin: tokenAdminAddress,
        image: image || undefined,
        metadata: {
          description: description || `${name} - Deployed via Molt.town`,
          socialMediaUrls: [],
          auditUrls: [],
        },
        context: {
          interface: 'Molt.town',
          platform: 'molt',
        },
        pool: {
          positions: POOL_POSITIONS.Standard,
        },
        fees: FEE_CONFIGS.DynamicBasic,
        rewards: {
          recipients: [
            {
              recipient: agentTreasuryAddress,
              admin: tokenAdminAddress,
              bps: 833,
              token: 'Paired',
            },
            {
              recipient: devRewardAddress || tokenAdminAddress,
              admin: devRewardAddress || tokenAdminAddress,
              bps: 3333,
              token: 'Paired',
            },
            {
              recipient: MOLT_REWARD_ADDRESS,
              admin: MOLT_REWARD_ADDRESS,
              bps: 4167,
              token: 'Paired',
            },
            {
              recipient: tokenAdminAddress,
              admin: tokenAdminAddress,
              bps: 1667,
              token: 'Paired',
            },
          ],
        },
      };

      const { txHash, waitForTransaction, error } = await clanker.deploy(tokenConfig);
      
      if (error) {
        throw error;
      }

      console.log(`Token deployment tx: ${txHash}`);

      const { address } = await waitForTransaction();

      console.log(`Token deployed at: ${address}`);

      return {
        tokenAddress: address,
        txHash,
        name,
        symbol,
        tradeUrl: `https://clanker.world/clanker/${address}`,
        basescanUrl: `${getExplorerUrl()}/token/${address}`,
        isTestnet: USE_TESTNET,
      };
    } catch (error) {
      console.error('Clanker deployment failed:', error);
      throw new Error(`Token deployment failed: ${error.message}`);
    }
  },

  getTokenInfo: async (tokenAddress) => {
    try {
      const publicClient = createPublicClient({
        chain: getChain(),
        transport: http(),
      });

      const [name, symbol, totalSupply] = await Promise.all([
        publicClient.readContract({
          address: tokenAddress,
          abi: [{ name: 'name', type: 'function', inputs: [], outputs: [{ type: 'string' }] }],
          functionName: 'name',
        }),
        publicClient.readContract({
          address: tokenAddress,
          abi: [{ name: 'symbol', type: 'function', inputs: [], outputs: [{ type: 'string' }] }],
          functionName: 'symbol',
        }),
        publicClient.readContract({
          address: tokenAddress,
          abi: [{ name: 'totalSupply', type: 'function', inputs: [], outputs: [{ type: 'uint256' }] }],
          functionName: 'totalSupply',
        }),
      ]);

      return { name, symbol, totalSupply: totalSupply.toString(), tokenAddress };
    } catch (error) {
      console.error('Failed to get token info:', error);
      throw new Error(`Failed to get token info: ${error.message}`);
    }
  },
};
