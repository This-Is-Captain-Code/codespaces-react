const BANKR_SKILL_REPO = 'https://github.com/BankrBot/openclaw-skills.git';
const BANKR_SKILL_PATH = 'bankr';

export const skillInstallerService = {
  installSkills: async (gatewayEndpoint, gatewayToken, options = {}) => {
    const {
      bankrApiKey,
      agentWalletAddress,
    } = options;

    console.log(`Installing skills to gateway ${gatewayEndpoint}...`);

    const installedSkills = [];
    const errors = [];

    try {
      const bankrSkillConfig = {
        name: 'bankr',
        enabled: true,
        config: {
          apiKey: bankrApiKey || '',
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

    try {
      const erc8004SkillConfig = {
        name: 'erc8004-identity',
        enabled: true,
        config: {
          chain: 'base',
          chainId: 8453,
        },
      };

      const erc8004Result = await installSkillToGateway(
        gatewayEndpoint,
        gatewayToken,
        erc8004SkillConfig
      );

      if (erc8004Result.success) {
        installedSkills.push('erc8004-identity');
        console.log('Installed erc8004-identity skill');
      } else {
        errors.push({ skill: 'erc8004-identity', error: erc8004Result.error });
        console.warn('Failed to install erc8004-identity skill:', erc8004Result.error);
      }
    } catch (error) {
      errors.push({ skill: 'erc8004-identity', error: error.message });
      console.warn('ERC-8004 skill installation error:', error.message);
    }

    return {
      installedSkills,
      errors,
      success: installedSkills.length > 0,
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
