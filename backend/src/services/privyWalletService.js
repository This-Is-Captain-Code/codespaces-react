import { PrivyClient } from '@privy-io/server-auth';

const PRIVY_APP_ID = process.env.PRIVY_APP_ID || process.env.VITE_PRIVY_APP_ID;
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET;

let privyClient = null;

function getPrivyClient() {
  if (!PRIVY_APP_ID || !PRIVY_APP_SECRET) {
    throw new Error('Privy not configured: PRIVY_APP_ID and PRIVY_APP_SECRET required');
  }
  
  if (!privyClient) {
    privyClient = new PrivyClient(PRIVY_APP_ID, PRIVY_APP_SECRET);
  }
  return privyClient;
}

export const privyWalletService = {
  isConfigured: () => {
    return !!(PRIVY_APP_ID && PRIVY_APP_SECRET);
  },

  createAgentWallet: async (userId) => {
    const client = getPrivyClient();
    
    try {
      console.log(`Creating server wallet for agent (user: ${userId})...`);
      
      const wallet = await client.walletApi.create({
        chainType: 'ethereum',
      });
      
      console.log(`Created agent wallet: ${wallet.address} (ID: ${wallet.id})`);
      
      return {
        address: wallet.address,
        walletId: wallet.id,
        chainType: 'ethereum',
      };
    } catch (error) {
      console.error('Failed to create agent wallet:', error);
      throw new Error(`Failed to create agent wallet: ${error.message}`);
    }
  },

  getWallet: async (walletId) => {
    const client = getPrivyClient();
    
    try {
      const wallet = await client.walletApi.get(walletId);
      return {
        address: wallet.address,
        walletId: wallet.id,
        chainType: wallet.chainType,
      };
    } catch (error) {
      console.error(`Failed to get wallet ${walletId}:`, error);
      throw new Error(`Failed to get wallet: ${error.message}`);
    }
  },

  signTransaction: async (walletId, transaction) => {
    const client = getPrivyClient();
    
    try {
      const signature = await client.walletApi.ethereum.signTransaction({
        walletId,
        transaction,
      });
      return signature;
    } catch (error) {
      console.error('Failed to sign transaction:', error);
      throw new Error(`Failed to sign transaction: ${error.message}`);
    }
  },

  sendTransaction: async (walletId, transaction, chainId = 8453) => {
    const client = getPrivyClient();
    
    try {
      const result = await client.walletApi.ethereum.sendTransaction({
        walletId,
        caip2: `eip155:${chainId}`,
        transaction,
      });
      return result;
    } catch (error) {
      console.error('Failed to send transaction:', error);
      throw new Error(`Failed to send transaction: ${error.message}`);
    }
  },

  getUserEmbeddedWallet: async (privyUserId) => {
    const client = getPrivyClient();
    
    try {
      const user = await client.getUser(privyUserId);
      
      const embeddedWallet = user.linkedAccounts?.find(
        account => account.type === 'wallet' && account.walletClientType === 'privy'
      );
      
      if (embeddedWallet) {
        return {
          address: embeddedWallet.address,
          chainType: embeddedWallet.chainType || 'ethereum',
        };
      }
      
      return null;
    } catch (error) {
      console.error('Failed to get user embedded wallet:', error);
      return null;
    }
  },
};
