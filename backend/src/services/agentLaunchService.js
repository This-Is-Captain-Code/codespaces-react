import { db } from '../db/index.js';
import { flyService } from './flyService.js';
import { privyWalletService } from './privyWalletService.js';
import { clankerService } from './clankerService.js';
import { erc8004Service } from './erc8004Service.js';
import { skillInstallerService } from './skillInstallerService.js';
import { openrouterProvisioningService } from './openrouterProvisioningService.js';
import crypto from 'crypto';

const USE_TESTNET = process.env.USE_TESTNET === 'true';
const getNetworkMode = () => USE_TESTNET ? 'TESTNET' : 'MAINNET';

const LAUNCH_STEPS = [
  'creating_openrouter_key',
  'creating_wallet',
  'deploying_agent',
  'configuring_telegram',
  'installing_skills',
  'registering_identity',
  'deploying_token',
  'finalizing',
];

export const agentLaunchService = {
  launchAgent: async (userId, config, progressCallback = null) => {
    const {
      agentName,
      tokenSymbol,
      tokenName,
      model = 'anthropic/claude-opus-4.5',
      systemPrompt = 'You are a helpful AI assistant.',
      userWalletAddress,
      devRewardAddress,
      limitUsd = 5.00,
      telegramBotToken,
      twitterToken,
    } = config;

    const launchState = {
      step: 0,
      currentStep: null,
      completedSteps: [],
      error: null,
      openrouterKeyHash: null,
      flyAppName: null,
      agentWalletId: null,
      tokenAddress: null,
      erc8004Id: null,
    };

    const sendProgress = (step, status, data = {}) => {
      launchState.currentStep = step;
      if (status === 'completed') {
        launchState.completedSteps.push(step);
      }
      if (progressCallback) {
        progressCallback({
          step,
          stepIndex: LAUNCH_STEPS.indexOf(step),
          totalSteps: LAUNCH_STEPS.length,
          status,
          networkMode: getNetworkMode(),
          timestamp: new Date().toISOString(),
          ...data,
        });
      }
    };

    try {
      const existingBot = await db.query(
        `SELECT id FROM bots WHERE user_id = $1`,
        [userId]
      );

      if (existingBot.rows.length > 0) {
        throw new Error('User already has an agent. Delete the existing one first.');
      }

      let userOpenRouterKey = null;
      let openrouterKeyHash = null;

      sendProgress('creating_openrouter_key', 'in_progress', {
        api: 'openrouter.ai',
        limitUsd,
      });
      if (openrouterProvisioningService.isProvisioningConfigured()) {
        const keyResult = await openrouterProvisioningService.createUserKey({
          name: `Molt-${agentName}-${userId.substring(0, 8)}`,
          limitUsd,
          userId,
        });
        userOpenRouterKey = keyResult.key;
        openrouterKeyHash = keyResult.keyHash;
        launchState.openrouterKeyHash = openrouterKeyHash;
      }
      sendProgress('creating_openrouter_key', 'completed', {
        api: 'openrouter.ai',
        keyCreated: !!userOpenRouterKey,
        limitUsd,
      });

      // Create wallet FIRST so we can include the address in the gateway config
      sendProgress('creating_wallet', 'in_progress', {
        provider: 'privy.io',
        chain: USE_TESTNET ? 'Base Sepolia' : 'Base',
      });
      let agentWallet = null;
      if (privyWalletService.isConfigured()) {
        try {
          agentWallet = await privyWalletService.createAgentWallet(userId);
          launchState.agentWalletId = agentWallet.walletId;
        } catch (walletError) {
          console.warn('Agent wallet creation failed, continuing without:', walletError.message);
        }
      }
      sendProgress('creating_wallet', 'completed', { 
        provider: 'privy.io',
        chain: USE_TESTNET ? 'Base Sepolia' : 'Base',
        walletAddress: agentWallet?.address || null,
        walletId: agentWallet?.walletId || null,
      });

      sendProgress('deploying_agent', 'in_progress', {
        provider: 'fly.io',
        region: 'iad',
      });
      let userGateway;
      try {
        userGateway = await flyService.createUserGateway(userId, {
          model,
          systemPrompt,
          botName: agentName,
          openrouterApiKey: userOpenRouterKey,
          tokenSymbol,
          tokenName: tokenName || agentName,
          agentWalletAddress: agentWallet?.address,
          telegramBotToken,
        });
        launchState.flyAppName = userGateway.appName;
      } catch (flyError) {
        if (openrouterKeyHash) {
          await cleanupOpenRouterKey(openrouterKeyHash);
        }
        throw flyError;
      }
      sendProgress('deploying_agent', 'completed', { 
        provider: 'fly.io',
        appName: userGateway.appName,
        endpoint: userGateway.endpoint,
        region: userGateway.region || 'iad',
        machineId: userGateway.machineId,
      });

      sendProgress('configuring_telegram', 'in_progress', {
        configured: !!telegramBotToken,
      });
      let telegramResult = { configured: false, username: null };
      if (telegramBotToken) {
        telegramResult = { configured: true, username: userGateway.telegramUsername || null };
      }
      sendProgress('configuring_telegram', 'completed', {
        configured: telegramResult.configured,
        username: telegramResult.username,
      });

      sendProgress('installing_skills', 'in_progress', {
        source: 'github.com/BankrBot/openclaw-skills',
        targetSkills: ['bankr', 'erc-8004'],
      });
      let skillsResult = { installedSkills: [], errors: [] };
      try {
        skillsResult = await skillInstallerService.installSkills(
          userGateway.endpoint,
          userGateway.gatewayToken,
          {
            agentWalletAddress: agentWallet?.address,
          }
        );
      } catch (skillError) {
        console.warn('Skill installation failed:', skillError.message);
      }
      sendProgress('installing_skills', 'completed', { 
        source: 'github.com/BankrBot/openclaw-skills',
        skills: skillsResult.installedSkills,
        errors: skillsResult.errors?.length || 0,
      });

      sendProgress('registering_identity', 'in_progress', {
        protocol: 'ERC-8004',
        chain: USE_TESTNET ? 'Sepolia' : 'Ethereum Mainnet',
        simulated: USE_TESTNET,
      });
      let erc8004Result = { registered: false, agentId: null };
      if (erc8004Service.isConfigured()) {
        try {
          erc8004Result = await erc8004Service.registerAgent({
            name: agentName,
            description: `${agentName} - AI Agent on Molt.town`,
            agentEndpoint: userGateway.endpoint,
            tokenAddress: null,
            agentWalletAddress: agentWallet?.address,
          });
          launchState.erc8004Id = erc8004Result.agentId;
        } catch (identityError) {
          console.warn('ERC-8004 registration failed:', identityError.message);
        }
      }
      sendProgress('registering_identity', 'completed', { 
        protocol: 'ERC-8004',
        chain: USE_TESTNET ? 'Sepolia' : 'Ethereum Mainnet',
        simulated: USE_TESTNET,
        agentId: erc8004Result.agentId,
        registered: erc8004Result.registered,
        txHash: erc8004Result.txHash || null,
      });

      sendProgress('deploying_token', 'in_progress', {
        protocol: 'Clanker',
        chain: USE_TESTNET ? 'Base Sepolia' : 'Base',
        simulated: USE_TESTNET,
        symbol: tokenSymbol,
      });
      let tokenResult = null;
      if (clankerService.isConfigured() && tokenSymbol) {
        try {
          tokenResult = await clankerService.deployToken({
            name: tokenName || agentName,
            symbol: tokenSymbol,
            tokenAdminAddress: agentWallet?.address || userWalletAddress,
            agentTreasuryAddress: agentWallet?.address || userWalletAddress,
            devRewardAddress: devRewardAddress || userWalletAddress,
            description: `${agentName} - AI Agent token deployed via Molt.town`,
          });
          launchState.tokenAddress = tokenResult.tokenAddress;
        } catch (tokenError) {
          console.warn('Token deployment failed:', tokenError.message);
        }
      }
      sendProgress('deploying_token', 'completed', {
        protocol: 'Clanker',
        chain: USE_TESTNET ? 'Base Sepolia' : 'Base',
        simulated: USE_TESTNET,
        tokenAddress: tokenResult?.tokenAddress,
        symbol: tokenSymbol,
        tradeUrl: tokenResult?.tradeUrl,
        basescanUrl: tokenResult?.basescanUrl,
        txHash: tokenResult?.txHash || null,
      });

      sendProgress('finalizing', 'in_progress');

      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

      const botResult = await db.query(
        `INSERT INTO bots (
          user_id, bot_name, endpoint, model, system_prompt, status,
          gateway_id, agent_id, fly_gateway_token, openrouter_key_hash, openrouter_limit_usd,
          agent_wallet_address, agent_wallet_id, token_address, token_symbol, token_name,
          erc8004_id, user_wallet_address, token_hash
        ) VALUES ($1, $2, $3, $4, $5, 'running', $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        RETURNING id, bot_name, model, system_prompt, status, created_at`,
        [
          userId,
          agentName,
          userGateway.endpoint,
          model,
          systemPrompt,
          userGateway.appName,
          'main',
          userGateway.gatewayToken,
          openrouterKeyHash,
          limitUsd,
          agentWallet?.address || null,
          agentWallet?.walletId || null,
          tokenResult?.tokenAddress || null,
          tokenSymbol || null,
          tokenName || agentName,
          erc8004Result.agentId || null,
          userWalletAddress || null,
          tokenHash,
        ]
      );

      const bot = botResult.rows[0];

      await db.query(
        `INSERT INTO bot_tokens (bot_id, token) VALUES ($1, $2)`,
        [bot.id, tokenHash]
      );

      sendProgress('finalizing', 'completed');

      return {
        success: true,
        botId: bot.id,
        accessToken: token,
        agentName: bot.bot_name,
        endpoint: userGateway.endpoint,
        controlUrl: userGateway.controlUrl,
        agentWallet: agentWallet ? {
          address: agentWallet.address,
          walletId: agentWallet.walletId,
        } : null,
        token: tokenResult ? {
          address: tokenResult.tokenAddress,
          symbol: tokenSymbol,
          name: tokenName || agentName,
          tradeUrl: tokenResult.tradeUrl,
          basescanUrl: tokenResult.basescanUrl,
        } : null,
        erc8004: erc8004Result.registered ? {
          agentId: erc8004Result.agentId,
          registryAddress: erc8004Result.registryAddress,
        } : null,
        telegram: telegramResult.configured ? {
          configured: true,
          username: telegramResult.username,
        } : null,
        skills: skillsResult.installedSkills,
        status: 'running',
      };
    } catch (error) {
      console.error('Agent launch failed:', error);

      await rollbackLaunch(launchState);

      throw error;
    }
  },

  recoverAgentWallet: async (userId) => {
    const botResult = await db.query(
      `SELECT agent_wallet_id, agent_wallet_address FROM bots WHERE user_id = $1`,
      [userId]
    );

    if (botResult.rows.length === 0) {
      throw new Error('No agent found for user');
    }

    const bot = botResult.rows[0];

    if (!bot.agent_wallet_id) {
      throw new Error('No agent wallet ID stored - wallet cannot be recovered');
    }

    if (!privyWalletService.isConfigured()) {
      throw new Error('Privy wallet service not configured');
    }

    const wallet = await privyWalletService.getWallet(bot.agent_wallet_id);

    return {
      address: wallet.address,
      walletId: wallet.walletId,
      recovered: true,
    };
  },

  getLaunchStatus: async (userId) => {
    const result = await db.query(
      `SELECT 
        b.id, b.bot_name, b.endpoint, b.status, b.model,
        b.agent_wallet_address, b.agent_wallet_id,
        b.token_address, b.token_symbol, b.token_name,
        b.erc8004_id, b.user_wallet_address,
        b.gateway_id, b.fly_gateway_token, b.created_at
      FROM bots b
      WHERE b.user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const bot = result.rows[0];
    const controlUrl = bot.endpoint && bot.fly_gateway_token
      ? `${bot.endpoint}/?token=${bot.fly_gateway_token}`
      : bot.endpoint;

    return {
      botId: bot.id,
      agentName: bot.bot_name,
      endpoint: bot.endpoint,
      controlUrl: controlUrl,
      status: bot.status,
      model: bot.model,
      agentWallet: bot.agent_wallet_address ? {
        address: bot.agent_wallet_address,
        walletId: bot.agent_wallet_id,
      } : null,
      token: bot.token_address ? {
        address: bot.token_address,
        symbol: bot.token_symbol,
        name: bot.token_name,
        tradeUrl: `https://clanker.world/clanker/${bot.token_address}`,
      } : null,
      erc8004: bot.erc8004_id ? {
        agentId: bot.erc8004_id,
      } : null,
      userWallet: bot.user_wallet_address,
      flyAppName: bot.gateway_id,
      createdAt: bot.created_at,
    };
  },
};

async function rollbackLaunch(state) {
  console.log('Rolling back failed launch...');

  if (state.flyAppName) {
    try {
      await flyService.deleteUserGateway(state.flyAppName);
      console.log(`Deleted Fly app: ${state.flyAppName}`);
    } catch (error) {
      console.warn(`Failed to delete Fly app: ${error.message}`);
    }
  }

  if (state.openrouterKeyHash) {
    await cleanupOpenRouterKey(state.openrouterKeyHash);
  }
}

async function cleanupOpenRouterKey(keyHash) {
  if (openrouterProvisioningService.isProvisioningConfigured()) {
    try {
      await openrouterProvisioningService.deleteKey(keyHash);
      console.log(`Cleaned up OpenRouter key: ${keyHash}`);
    } catch (error) {
      console.warn(`Failed to cleanup OpenRouter key: ${error.message}`);
    }
  }
}
