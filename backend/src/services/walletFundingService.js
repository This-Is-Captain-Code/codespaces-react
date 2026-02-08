import { createPublicClient, createWalletClient, http, parseEther, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base, baseSepolia } from 'viem/chains';

const USE_TESTNET = process.env.USE_TESTNET === 'true';

const FUNDING_AMOUNT = '0.0001';

const CHAIN_CONFIG = {
  chain: USE_TESTNET ? baseSepolia : base,
  chainName: USE_TESTNET ? 'Base Sepolia' : 'Base',
};

export const walletFundingService = {
  isConfigured: () => {
    return !!process.env.ADMIN_WALLET_PRIVATE_KEY;
  },

  fundWallet: async (targetAddress) => {
    const adminKey = process.env.ADMIN_WALLET_PRIVATE_KEY;
    if (!adminKey) {
      throw new Error('ADMIN_WALLET_PRIVATE_KEY not configured');
    }

    const formattedKey = adminKey.startsWith('0x') ? adminKey : `0x${adminKey}`;
    const account = privateKeyToAccount(formattedKey);
    const { chain, chainName } = CHAIN_CONFIG;

    const publicClient = createPublicClient({ chain, transport: http() });
    const walletClient = createWalletClient({ account, chain, transport: http() });

    const balance = await publicClient.getBalance({ address: account.address });
    const fundAmount = parseEther(FUNDING_AMOUNT);

    if (balance < fundAmount + parseEther('0.00005')) {
      console.warn(`[wallet-funding] Admin wallet balance too low: ${formatEther(balance)} ETH on ${chainName}`);
      throw new Error(`Insufficient admin balance on ${chainName}: ${formatEther(balance)} ETH`);
    }

    console.log(`[wallet-funding] Sending ${FUNDING_AMOUNT} ETH to ${targetAddress} on ${chainName}...`);

    const hash = await walletClient.sendTransaction({
      to: targetAddress,
      value: fundAmount,
    });

    console.log(`[wallet-funding] Transaction sent: ${hash}`);

    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });

    if (receipt.status !== 'success') {
      throw new Error(`Funding transaction failed: ${hash}`);
    }

    const remainingBalance = await publicClient.getBalance({ address: account.address });
    console.log(`[wallet-funding] Funded ${targetAddress} with ${FUNDING_AMOUNT} ETH. Admin balance remaining: ${formatEther(remainingBalance)} ETH`);

    return {
      txHash: hash,
      amount: FUNDING_AMOUNT,
      chain: chainName,
      targetAddress,
      gasUsed: Number(receipt.gasUsed),
      adminBalanceRemaining: formatEther(remainingBalance),
    };
  },
};
