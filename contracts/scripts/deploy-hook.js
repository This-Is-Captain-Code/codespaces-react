import { createWalletClient, createPublicClient, http, encodePacked, keccak256, encodeAbiParameters, parseAbiParameters, getContractAddress, concat, toHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const POOL_MANAGER_BASE_SEPOLIA = '0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408';
const CREATE2_DEPLOYER = '0x4e59b44847b379578588920cA78FbF26c0B4956C';

const AFTER_INITIALIZE_FLAG = 1n << 12n;
const BEFORE_SWAP_FLAG = 1n << 7n;
const AFTER_SWAP_FLAG = 1n << 6n;
const AFTER_SWAP_RETURNS_DELTA_FLAG = 1n << 2n;

const REQUIRED_FLAGS = AFTER_INITIALIZE_FLAG | BEFORE_SWAP_FLAG | AFTER_SWAP_FLAG | AFTER_SWAP_RETURNS_DELTA_FLAG;

const ALL_FLAGS_MASK = (1n << 14n) - 1n;

function checkFlags(address) {
  const addrBigInt = BigInt(address);
  const addrFlags = addrBigInt & ALL_FLAGS_MASK;
  return addrFlags === REQUIRED_FLAGS;
}

function mineCreate2Salt(deployerAddress, initCodeHash, maxAttempts = 5000000) {
  console.log(`Mining CREATE2 salt for hook address...`);
  console.log(`Required flags: 0x${REQUIRED_FLAGS.toString(16)} (afterInitialize, beforeSwap, afterSwap, afterSwapReturnDelta)`);
  console.log(`Deployer: ${deployerAddress}`);
  
  const deployerBytes = Buffer.from(deployerAddress.slice(2), 'hex');
  const initCodeHashBytes = Buffer.from(initCodeHash.slice(2), 'hex');
  
  for (let i = 0; i < maxAttempts; i++) {
    const saltHex = i.toString(16).padStart(64, '0');
    const saltBytes = Buffer.from(saltHex, 'hex');
    
    const data = Buffer.concat([
      Buffer.from([0xff]),
      deployerBytes,
      saltBytes,
      initCodeHashBytes
    ]);
    
    const hash = keccak256(`0x${data.toString('hex')}`);
    const address = `0x${hash.slice(26)}`;
    
    if (checkFlags(address)) {
      console.log(`Found valid salt after ${i + 1} attempts!`);
      console.log(`Salt: 0x${saltHex}`);
      console.log(`Hook address: ${address}`);
      return { salt: `0x${saltHex}`, address };
    }
    
    if (i > 0 && i % 500000 === 0) {
      console.log(`  ... ${i} attempts so far`);
    }
  }
  
  throw new Error(`Could not find valid salt after ${maxAttempts} attempts`);
}

async function main() {
  const privateKey = process.env.ADMIN_WALLET_PRIVATE_KEY;
  if (!privateKey) {
    console.error('ADMIN_WALLET_PRIVATE_KEY environment variable required');
    process.exit(1);
  }

  const formattedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
  const account = privateKeyToAccount(formattedKey);
  console.log(`Deployer account: ${account.address}`);

  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http('https://sepolia.base.org'),
  });

  const walletClient = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http('https://sepolia.base.org'),
  });

  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`Balance: ${balance} wei (${Number(balance) / 1e18} ETH)`);

  if (balance < 1000000000000000n) {
    console.error('Insufficient balance. Need at least 0.001 Base Sepolia ETH.');
    console.error('Get testnet ETH from https://www.alchemy.com/faucets/base-sepolia');
    process.exit(1);
  }

  const artifact = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../out/MoltFeeRouter.sol/MoltFeeRouter.json'), 'utf8')
  );
  const bytecode = artifact.bytecode.object;

  const constructorArgs = encodeAbiParameters(
    parseAbiParameters('address, address'),
    [POOL_MANAGER_BASE_SEPOLIA, account.address]
  );

  const initCode = concat([bytecode, constructorArgs]);
  const initCodeHash = keccak256(initCode);
  
  console.log(`Init code hash: ${initCodeHash}`);
  console.log(`Constructor args: poolManager=${POOL_MANAGER_BASE_SEPOLIA}, moltAdmin=${account.address}`);

  const { salt, address: expectedAddress } = mineCreate2Salt(CREATE2_DEPLOYER, initCodeHash);

  console.log(`\nDeploying MoltFeeRouter to Base Sepolia...`);
  console.log(`Expected address: ${expectedAddress}`);

  const deployData = concat([salt, initCode]);

  const hash = await walletClient.sendTransaction({
    to: CREATE2_DEPLOYER,
    data: deployData,
    gas: 5000000n,
  });

  console.log(`Transaction hash: ${hash}`);
  console.log('Waiting for confirmation...');

  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });

  if (receipt.status === 'success') {
    console.log(`\nDeployment successful!`);
    console.log(`Block: ${receipt.blockNumber}`);
    console.log(`Gas used: ${receipt.gasUsed}`);
    console.log(`Hook address: ${expectedAddress}`);
    console.log(`\nSet this in your environment:`);
    console.log(`MOLT_FEE_ROUTER_ADDRESS=${expectedAddress}`);

    const code = await publicClient.getCode({ address: expectedAddress });
    if (code && code !== '0x') {
      console.log(`\nContract code verified at ${expectedAddress} (${code.length / 2 - 1} bytes)`);
    } else {
      console.warn(`\nWARNING: No code found at expected address. The CREATE2 address may differ.`);
      if (receipt.contractAddress) {
        console.log(`Actual contract address from receipt: ${receipt.contractAddress}`);
      }
    }
  } else {
    console.error('Transaction failed!');
    console.error(receipt);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Deployment failed:', err);
  process.exit(1);
});
