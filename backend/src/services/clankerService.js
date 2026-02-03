import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';

const ADMIN_WALLET_PRIVATE_KEY = process.env.ADMIN_WALLET_PRIVATE_KEY;
const MOLT_REWARD_ADDRESS = process.env.MOLT_REWARD_ADDRESS || '0x0000000000000000000000000000000000000000';
const DEV_REWARD_ADDRESS = process.env.DEV_REWARD_ADDRESS;

export const clankerService = {
  isConfigured: () => {
    return !!ADMIN_WALLET_PRIVATE_KEY;
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

    console.log(`Deploying Clanker token: ${name} (${symbol})...`);

    try {
      const { Clanker, POOL_POSITIONS, FEE_CONFIGS } = await import('clanker-sdk/v4');

      const account = privateKeyToAccount(ADMIN_WALLET_PRIVATE_KEY);
      
      const publicClient = createPublicClient({
        chain: base,
        transport: http(),
      });
      
      const walletClient = createWalletClient({
        account,
        chain: base,
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
        basescanUrl: `https://basescan.org/token/${address}`,
      };
    } catch (error) {
      console.error('Clanker deployment failed:', error);
      throw new Error(`Token deployment failed: ${error.message}`);
    }
  },

  getTokenInfo: async (tokenAddress) => {
    try {
      const publicClient = createPublicClient({
        chain: base,
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
