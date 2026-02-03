import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';

const ADMIN_WALLET_PRIVATE_KEY = process.env.ADMIN_WALLET_PRIVATE_KEY;
const ERC8004_REGISTRY_ADDRESS = process.env.ERC8004_REGISTRY_ADDRESS;

const IDENTITY_REGISTRY_ABI = [
  {
    name: 'register',
    type: 'function',
    inputs: [{ name: 'agentURI', type: 'string' }],
    outputs: [{ name: 'agentId', type: 'uint256' }],
  },
  {
    name: 'setAgentURI',
    type: 'function',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'newURI', type: 'string' },
    ],
    outputs: [],
  },
  {
    name: 'tokenURI',
    type: 'function',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    name: 'ownerOf',
    type: 'function',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'Transfer',
    type: 'event',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'tokenId', type: 'uint256', indexed: true },
    ],
  },
  {
    name: 'Registered',
    type: 'event',
    inputs: [
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'agentURI', type: 'string', indexed: false },
      { name: 'owner', type: 'address', indexed: true },
    ],
  },
];

function createAgentRegistrationFile(options) {
  const {
    name,
    description,
    image,
    agentEndpoint,
    tokenAddress,
    agentWalletAddress,
    agentId,
  } = options;

  const registrationFile = {
    type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    name,
    description: description || `${name} - AI Agent deployed via Molt.town`,
    image: image || 'https://molt.town/agent-default.png',
    services: [
      {
        name: 'A2A',
        endpoint: `${agentEndpoint}/.well-known/agent-card.json`,
        version: '0.3.0',
      },
      {
        name: 'web',
        endpoint: agentEndpoint,
      },
    ],
    x402Support: true,
    active: true,
    registrations: agentId ? [
      {
        agentId: Number(agentId),
        agentRegistry: `eip155:8453:${ERC8004_REGISTRY_ADDRESS}`,
      },
    ] : [],
    supportedTrust: ['reputation'],
    extensions: {
      molt: {
        tokenAddress,
        agentWallet: agentWalletAddress,
        platform: 'molt.town',
      },
    },
  };

  return registrationFile;
}

function encodeRegistrationAsDataUri(registrationFile) {
  const json = JSON.stringify(registrationFile);
  const base64 = Buffer.from(json).toString('base64');
  return `data:application/json;base64,${base64}`;
}

export const erc8004Service = {
  isConfigured: () => {
    return !!(ADMIN_WALLET_PRIVATE_KEY && ERC8004_REGISTRY_ADDRESS);
  },

  registerAgent: async (options) => {
    const {
      name,
      description,
      image,
      agentEndpoint,
      tokenAddress,
      agentWalletAddress,
    } = options;

    if (!ADMIN_WALLET_PRIVATE_KEY) {
      throw new Error('ADMIN_WALLET_PRIVATE_KEY not configured');
    }

    if (!ERC8004_REGISTRY_ADDRESS) {
      console.warn('ERC8004_REGISTRY_ADDRESS not configured, skipping on-chain registration');
      return {
        agentId: null,
        registered: false,
        reason: 'ERC-8004 registry not configured',
      };
    }

    console.log(`Registering agent "${name}" on ERC-8004 registry...`);

    try {
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

      const registrationFile = createAgentRegistrationFile({
        name,
        description,
        image,
        agentEndpoint,
        tokenAddress,
        agentWalletAddress,
      });

      const agentURI = encodeRegistrationAsDataUri(registrationFile);

      const hash = await walletClient.writeContract({
        address: ERC8004_REGISTRY_ADDRESS,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'register',
        args: [agentURI],
      });

      console.log(`Registration tx: ${hash}`);

      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      const registeredEvent = receipt.logs.find(log => {
        try {
          return log.topics[0] === '0x' + Buffer.from('Registered(uint256,string,address)').toString('hex').slice(0, 64);
        } catch {
          return false;
        }
      });

      let agentId = null;
      if (registeredEvent && registeredEvent.topics[1]) {
        agentId = parseInt(registeredEvent.topics[1], 16);
      }

      const transferEvent = receipt.logs.find(log => log.topics.length === 4);
      if (!agentId && transferEvent && transferEvent.topics[3]) {
        agentId = parseInt(transferEvent.topics[3], 16);
      }

      console.log(`Agent registered with ID: ${agentId}`);

      return {
        agentId,
        txHash: hash,
        registryAddress: ERC8004_REGISTRY_ADDRESS,
        registered: true,
      };
    } catch (error) {
      console.error('ERC-8004 registration failed:', error);
      return {
        agentId: null,
        registered: false,
        reason: error.message,
      };
    }
  },

  getAgentInfo: async (agentId) => {
    if (!ERC8004_REGISTRY_ADDRESS) {
      throw new Error('ERC8004_REGISTRY_ADDRESS not configured');
    }

    const publicClient = createPublicClient({
      chain: base,
      transport: http(),
    });

    try {
      const [tokenURI, owner] = await Promise.all([
        publicClient.readContract({
          address: ERC8004_REGISTRY_ADDRESS,
          abi: IDENTITY_REGISTRY_ABI,
          functionName: 'tokenURI',
          args: [BigInt(agentId)],
        }),
        publicClient.readContract({
          address: ERC8004_REGISTRY_ADDRESS,
          abi: IDENTITY_REGISTRY_ABI,
          functionName: 'ownerOf',
          args: [BigInt(agentId)],
        }),
      ]);

      let registrationData = null;
      if (tokenURI.startsWith('data:application/json;base64,')) {
        const base64Data = tokenURI.replace('data:application/json;base64,', '');
        registrationData = JSON.parse(Buffer.from(base64Data, 'base64').toString());
      }

      return {
        agentId,
        owner,
        tokenURI,
        registrationData,
      };
    } catch (error) {
      console.error('Failed to get agent info:', error);
      throw new Error(`Failed to get agent info: ${error.message}`);
    }
  },

  createRegistrationFile: createAgentRegistrationFile,
  encodeAsDataUri: encodeRegistrationAsDataUri,
};
