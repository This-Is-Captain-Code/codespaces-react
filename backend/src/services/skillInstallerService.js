// Skills are installed from the BankrBot/openclaw-skills GitHub repository
// Bankr uses a SHARED PLATFORM API KEY (BANKR_API_KEY env var) for all agents
// Each agent trades using their own Privy wallet - the API key just authenticates the platform
const SKILLS_REPO = 'https://github.com/BankrBot/openclaw-skills';

const AVAILABLE_SKILLS = {
  bankr: {
    name: 'bankr',
    path: 'bankr',
    description: 'AI-powered crypto trading agent via natural language',
    requires: ['curl', 'jq'],
  },
  'erc-8004': {
    name: 'erc-8004',
    path: 'erc-8004',
    description: 'Register AI agents on Ethereum mainnet using ERC-8004',
  },
  clanker: {
    name: 'clanker',
    path: 'clanker',
    description: 'Clanker SDK skill for token deployment on Base',
  },
  botchan: {
    name: 'botchan',
    path: 'botchan',
    description: 'Onchain agent messaging on Base',
  },
};

export const skillInstallerService = {
  getAvailableSkills: () => AVAILABLE_SKILLS,

  getSkillsRepoUrl: () => SKILLS_REPO,

  installSkills: async (gatewayEndpoint, gatewayToken, options = {}) => {
    const {
      bankrApiKey,
      agentWalletAddress,
      skillsToInstall = ['bankr', 'erc-8004'],
    } = options;

    console.log(`Installing skills to gateway ${gatewayEndpoint}...`);
    console.log(`Skills repo: ${SKILLS_REPO}`);

    const installedSkills = [];
    const errors = [];

    if (skillsToInstall.includes('bankr')) {
      try {
        const bankrSkillConfig = {
          name: 'bankr',
          source: `${SKILLS_REPO}/tree/main/bankr`,
          enabled: true,
          config: {
            apiKey: bankrApiKey || process.env.BANKR_API_KEY || '',
            apiUrl: 'https://api.bankr.bot',
            walletAddress: agentWalletAddress,
          },
        };

        const bankrResult = await installSkillToGateway(
          gatewayEndpoint,
          gatewayToken,
          bankrSkillConfig
        );

        if (bankrResult.success) {
          installedSkills.push('bankr');
          console.log('Installed bankr skill');
        } else {
          errors.push({ skill: 'bankr', error: bankrResult.error });
          console.warn('Failed to install bankr skill:', bankrResult.error);
        }
      } catch (error) {
        errors.push({ skill: 'bankr', error: error.message });
        console.warn('Bankr skill installation error:', error.message);
      }
    }

    if (skillsToInstall.includes('erc-8004')) {
      try {
        const erc8004SkillConfig = {
          name: 'erc-8004',
          source: `${SKILLS_REPO}/tree/main/erc-8004`,
          enabled: true,
          config: {
            chain: 'ethereum',
            chainId: 1,
            identityRegistry: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
            reputationRegistry: '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63',
          },
        };

        const erc8004Result = await installSkillToGateway(
          gatewayEndpoint,
          gatewayToken,
          erc8004SkillConfig
        );

        if (erc8004Result.success) {
          installedSkills.push('erc-8004');
          console.log('Installed erc-8004 skill');
        } else {
          errors.push({ skill: 'erc-8004', error: erc8004Result.error });
          console.warn('Failed to install erc-8004 skill:', erc8004Result.error);
        }
      } catch (error) {
        errors.push({ skill: 'erc-8004', error: error.message });
        console.warn('ERC-8004 skill installation error:', error.message);
      }
    }

    return {
      installedSkills,
      errors,
      success: installedSkills.length > 0,
      skillsRepo: SKILLS_REPO,
    };
  },

  getInstalledSkills: async (gatewayEndpoint, gatewayToken) => {
    try {
      const response = await fetch(`${gatewayEndpoint}/api/skills`, {
        headers: {
          'Authorization': `Bearer ${gatewayToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to get skills: ${response.status}`);
      }

      const data = await response.json();
      return data.skills || [];
    } catch (error) {
      console.error('Failed to get installed skills:', error);
      return [];
    }
  },
};

async function installSkillToGateway(endpoint, token, skillConfig) {
  try {
    const response = await fetch(`${endpoint}/api/skills/install`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(skillConfig),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `HTTP ${response.status}: ${errorText}` };
    }

    const result = await response.json();
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
