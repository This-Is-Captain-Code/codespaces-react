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
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'name_', type: 'string', internalType: 'string' },
      { name: 'symbol_', type: 'string', internalType: 'string' },
      { name: 'initialSupply_', type: 'uint256', internalType: 'uint256' },
      { name: 'owner_', type: 'address', internalType: 'address' },
    ],
  },
];

const ERC20_BYTECODE = '0x608060405234801561000f575f5ffd5b506040516109a43803806109a483398101604081905261002e91610150565b5f610039858261026c565b506001610046848261026c565b50600380546001600160a01b0319166001600160a01b0383161790556002829055335f818152600460209081526040808320869055518581527fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef910160405180910390a35050505061032a565b634e487b7160e01b5f52604160045260245ffd5b5f82601f8301126100d6575f5ffd5b81516001600160401b038111156100ef576100ef6100b3565b604051601f8201601f19908116603f011681016001600160401b038111828210171561011d5761011d6100b3565b604052818152838201602001851015610134575f5ffd5b8160208501602083015e5f918101602001919091529392505050565b5f5f5f5f60808587031215610163575f5ffd5b84516001600160401b03811115610178575f5ffd5b610184878288016100c7565b602087015190955090506001600160401b038111156101a1575f5ffd5b6101ad878288016100c7565b60408701516060880151919550935090506001600160a01b03811681146101d2575f5ffd5b939692955090935050565b600181811c908216806101f157607f821691505b60208210810361020f57634e487b7160e01b5f52602260045260245ffd5b50919050565b601f821115610267578282111561026757805f5260205f20601f840160051c602085101561024057505f5b90810190601f840160051c035f5b81811015610263575f8382015560010161024e565b5050505b505050565b81516001600160401b03811115610285576102856100b3565b6102998161029384546101dd565b84610215565b6020601f8211600181146102cb575f83156102b45750848201515b5f19600385901b1c1916600184901b178455610323565b5f84815260208120601f198516915b828110156102fa57878501518255602094850194600190920191016102da565b508482101561031757868401515f19600387901b60f8161c191681555b505060018360011b0184555b5050505050565b61066d806103375f395ff3fe608060405234801561000f575f5ffd5b506004361061009b575f3560e01c806370a082311161006357806370a08231146101245780638da5cb5b1461014357806395d89b411461016e578063a9059cbb14610176578063dd62ed3e14610189575f5ffd5b806306fdde031461009f578063095ea7b3146100bd57806318160ddd146100e057806323b872dd146100f7578063313ce5671461010a575b5f5ffd5b6100a76101b3565b6040516100b49190610503565b60405180910390f35b6100d06100cb366004610553565b61023e565b60405190151581526020016100b4565b6100e960025481565b6040519081526020016100b4565b6100d061010536600461057b565b6102a9565b610112601281565b60405160ff90911681526020016100b4565b6100e96101323660046105b5565b60046020525f908152604090205481565b600354610156906001600160a01b031681565b6040516001600160a01b0390911681526020016100b4565b6100a761035c565b6100d0610184366004610553565b610369565b6100e96101973660046105ce565b600560209081525f928352604080842090915290825290205481565b5f80546101bf906105ff565b80601f01602080910402602001604051908101604052809291908181526020018280546101eb906105ff565b80156102365780601f1061020d57610100808354040283529160200191610236565b820191905f5260205f20905b81548152906001019060200180831161021957829003601f168201915b505050505081565b335f8181526005602090815260408083206001600160a01b038716808552925280832085905551919290917f8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925906102989086815260200190565b60405180910390a350600192915050565b6001600160a01b0383165f908152600560209081526040808320338452909152812054828110156103215760405162461bcd60e51b815260206004820152601d60248201527f45524332303a20696e73756666696369656e7420616c6c6f77616e636500000060448201526064015b60405180910390fd5b6001600160a01b0385165f9081526005602090815260408083203384529091529020838203905561035385858561037c565b95945050505050565b600180546101bf906105ff565b5f61037533848461037c565b9392505050565b5f6001600160a01b0384166103d35760405162461bcd60e51b815260206004820152601960248201527f45524332303a207472616e736665722066726f6d207a65726f000000000000006044820152606401610318565b6001600160a01b0383166104295760405162461bcd60e51b815260206004820152601760248201527f45524332303a207472616e7366657220746f207a65726f0000000000000000006044820152606401610318565b6001600160a01b0384165f90815260046020526040902054828110156104915760405162461bcd60e51b815260206004820152601b60248201527f45524332303a20696e73756666696369656e742062616c616e636500000000006044820152606401610318565b6001600160a01b038086165f8181526004602052604080822087860390559287168082529083902080548701905591517fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef906104f09087815260200190565b60405180910390a3506001949350505050565b602081525f82518060208401528060208501604085015e5f604082850101526040601f19601f83011684010191505092915050565b80356001600160a01b038116811461054e575f5ffd5b919050565b5f5f60408385031215610564575f5ffd5b61056d83610538565b946020939093013593505050565b5f5f5f6060848603121561058d575f5ffd5b61059684610538565b92506105a460208501610538565b929592945050506040919091013590565b5f602082840312156105c5575f5ffd5b61037582610538565b5f5f604083850312156105df575f5ffd5b6105e883610538565b91506105f660208401610538565b90509250929050565b600181811c9082168061061357607f821691505b60208210810361063157634e487b7160e01b5f52602260045260245ffd5b5091905056fea264697066735822122012c926edfaa74035721e72bd97181f92efa1e836207bed0fc0fb31ba25b40c4d64736f6c63430008210033';

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
      const formattedKey = ADMIN_WALLET_PRIVATE_KEY.startsWith('0x') ? ADMIN_WALLET_PRIVATE_KEY : `0x${ADMIN_WALLET_PRIVATE_KEY}`;
      const account = privateKeyToAccount(formattedKey);

      const publicClient = createPublicClient({
        chain,
        transport: http(),
      });

      const walletClient = createWalletClient({
        account,
        chain,
        transport: http(),
      });

      const balance = await publicClient.getBalance({ address: account.address });
      console.log(`[token-deploy] Admin wallet ${account.address} balance on ${chain.name}: ${formatEther(balance)} ETH`);

      if (balance < BigInt('100000000000000')) {
        throw new Error(`Insufficient admin balance on ${chain.name}: ${formatEther(balance)} ETH (need at least 0.0001 ETH for gas)`);
      }

      const supplyWei = BigInt(initialSupply) * BigInt(10 ** 18);
      console.log(`[token-deploy] Deploying ${name} (${symbol}) with supply ${initialSupply} to owner ${tokenAdminAddress}`);

      const txHash = await walletClient.deployContract({
        abi: ERC20_DEPLOY_ABI,
        bytecode: ERC20_BYTECODE,
        args: [name, symbol, supplyWei, tokenAdminAddress],
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
