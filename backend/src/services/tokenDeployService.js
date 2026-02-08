import { createPublicClient, createWalletClient, http, formatEther } from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { base, baseSepolia, mainnet, sepolia, arbitrum, arbitrumSepolia, optimism, optimismSepolia, polygon, polygonAmoy } from 'viem/chains';

const USE_TESTNET = process.env.USE_TESTNET === 'true';
const ADMIN_WALLET_PRIVATE_KEY = process.env.ADMIN_WALLET_PRIVATE_KEY;
const DEPLOY_CHAIN = process.env.DEPLOY_CHAIN || 'base';

const CHAINS = {
  base: { mainnet: base, testnet: baseSepolia, explorer: 'https://basescan.org', testExplorer: 'https://sepolia.basescan.org', nativeCurrency: 'ETH' },
  ethereum: { mainnet: mainnet, testnet: sepolia, explorer: 'https://etherscan.io', testExplorer: 'https://sepolia.etherscan.io', nativeCurrency: 'ETH' },
  arbitrum: { mainnet: arbitrum, testnet: arbitrumSepolia, explorer: 'https://arbiscan.io', testExplorer: 'https://sepolia.arbiscan.io', nativeCurrency: 'ETH' },
  optimism: { mainnet: optimism, testnet: optimismSepolia, explorer: 'https://optimistic.etherscan.io', testExplorer: 'https://sepolia-optimism.etherscan.io', nativeCurrency: 'ETH' },
  polygon: { mainnet: polygon, testnet: polygonAmoy, explorer: 'https://polygonscan.com', testExplorer: 'https://amoy.polygonscan.com', nativeCurrency: 'MATIC' },
};

const getChainConfig = () => CHAINS[DEPLOY_CHAIN] || CHAINS.base;
const getChain = () => USE_TESTNET ? getChainConfig().testnet : getChainConfig().mainnet;
const getExplorerUrl = () => USE_TESTNET ? getChainConfig().testExplorer : getChainConfig().explorer;

const ERC20_DEPLOY_ABI = [
  {
    type: 'constructor',
    inputs: [
      { name: 'name_', type: 'string' },
      { name: 'symbol_', type: 'string' },
      { name: 'initialSupply', type: 'uint256' },
      { name: 'owner', type: 'address' },
    ],
  },
];

const ERC20_BYTECODE = '0x60806040523480156200001157600080fd5b5060405162000c3838038062000c38833981016040819052620000349162000237565b8351849084906200004d906003906020850190620000c8565b50805162000063906004906020840190620000c8565b5050600580546001600160a01b0319166001600160a01b03841617905550620000a2826200009360126000620001b8565b6200009f9190620002ea565b90565b620000ae3382620000b8565b5050505062000362565b6001600160a01b038216620000e85760405163ec442f0560e01b815260006004820152602401604051809103fd5b620000f660008383620000fa565b5050565b6001600160a01b0383166200012957806002600082825462000121919062000305565b909155505050565b6001600160a01b038316600090815260208190526040902054818110156200016e5760405163391434e360e21b81526001600160a01b03851660048201526024810182905260448101839052606401604051809103fd5b6001600160a01b0380851660009081526020819052604080822085850390559185168152908120805484929062000121908490620003055600505050565b634e487b7160e01b600052601160045260246000fd5b6000816000190483118215151615620001d557620001d5620001a2565b500290565b634e487b7160e01b600052604160045260246000fd5b600082601f8301126200020257600080fd5b81516001600160401b03808211156200021f576200021f620001da565b604051601f8301601f19908116603f011681019082821181831017156200024a576200024a620001da565b816040528381526020925086838588010111156200026757600080fd5b600091505b838210156200028b57858201830151818301840152908201906200026c565b838211156200029d5760008385830101525b9695505050505050565b805160208083015191908110156200028b5760001960209190910360031b1b16919050565b600060208284031215620002e057600080fd5b5051919050565b6000816000190483118215151615620002ea57620002ea620001a2565b634e487b7160e01b600052601160045260246000fd5b600082198211156200031a576200031a620001a2565b500190565b6108d080620003726000396000f3fe';

export const tokenDeployService = {
  isConfigured: () => {
    if (USE_TESTNET) return true;
    return !!ADMIN_WALLET_PRIVATE_KEY;
  },

  isTestnet: () => USE_TESTNET,

  getDeployChain: () => DEPLOY_CHAIN,

  getNetworkInfo: () => ({
    isTestnet: USE_TESTNET,
    chain: getChain().name,
    chainId: getChain().id,
    explorerUrl: getExplorerUrl(),
    deployChain: DEPLOY_CHAIN,
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
      description,
      initialSupply = '1000000000',
    } = options;

    if (!ADMIN_WALLET_PRIVATE_KEY) {
      throw new Error('ADMIN_WALLET_PRIVATE_KEY not configured');
    }

    const chain = getChain();
    const explorer = getExplorerUrl();
    console.log(`Deploying token: ${name} (${symbol}) on ${chain.name}...`);

    if (USE_TESTNET) {
      console.log('TESTNET MODE: Simulating token deployment...');
      const mockAddress = `0x${Date.now().toString(16).padStart(40, '0')}`;
      return {
        tokenAddress: mockAddress,
        txHash: `0x${'test'.repeat(16)}`,
        name,
        symbol,
        chain: chain.name,
        chainId: chain.id,
        explorerUrl: `${explorer}/token/${mockAddress}`,
        isTestnet: true,
        note: 'Testnet mock - token deployment simulated',
      };
    }

    try {
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

      const txHash = await walletClient.deployContract({
        abi: ERC20_DEPLOY_ABI,
        bytecode: ERC20_BYTECODE,
        args: [name, symbol, BigInt(initialSupply) * BigInt(10 ** 18), tokenAdminAddress],
      });

      console.log(`Token deployment tx: ${txHash}`);

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      const tokenAddress = receipt.contractAddress;

      console.log(`Token deployed at: ${tokenAddress}`);

      return {
        tokenAddress,
        txHash,
        name,
        symbol,
        chain: chain.name,
        chainId: chain.id,
        explorerUrl: `${explorer}/token/${tokenAddress}`,
        isTestnet: false,
      };
    } catch (error) {
      console.error('Token deployment failed:', error);
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
