const SKILLS_REPO = 'https://github.com/BankrBot/openclaw-skills';

const AVAILABLE_SKILLS = {
  'molt-fees': {
    name: 'molt-fees',
    path: 'molt-fees',
    description: 'Manage dynamic trading fees via Uniswap v4 MoltFeeRouter Hook',
  },
  'liquidity-manager': {
    name: 'liquidity-manager',
    path: 'liquidity-manager',
    description: 'Cross-chain liquidity management: OpenClaw → Yellow Network → LI.FI → Uniswap v4',
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
      agentWalletAddress,
      skillsToInstall = ['molt-fees', 'liquidity-manager'],
    } = options;

    console.log(`Installing skills to gateway ${gatewayEndpoint}...`);
    console.log(`Skills repo: ${SKILLS_REPO}`);

    const installedSkills = [];
    const errors = [];

    if (skillsToInstall.includes('molt-fees')) {
      try {
        const moltFeesConfig = {
          name: 'molt-fees',
          enabled: true,
          config: {
            walletAddress: agentWalletAddress,
          },
        };

        const moltFeesResult = await installSkillToGateway(
          gatewayEndpoint,
          gatewayToken,
          moltFeesConfig
        );

        if (moltFeesResult.success) {
          installedSkills.push('molt-fees');
          console.log('Installed molt-fees skill');
        } else {
          errors.push({ skill: 'molt-fees', error: moltFeesResult.error });
          console.warn('Failed to install molt-fees skill:', moltFeesResult.error);
        }
      } catch (error) {
        errors.push({ skill: 'molt-fees', error: error.message });
        console.warn('molt-fees skill installation error:', error.message);
      }
    }

    if (skillsToInstall.includes('liquidity-manager')) {
      try {
        const liquidityManagerConfig = {
          name: 'liquidity-manager',
          enabled: true,
          config: {
            walletAddress: agentWalletAddress,
            sourceChain: 'base',
            destChain: 'arbitrum',
            layers: ['openclaw', 'yellow-network', 'lifi', 'uniswap-v4'],
          },
        };

        const lmResult = await installSkillToGateway(
          gatewayEndpoint,
          gatewayToken,
          liquidityManagerConfig
        );

        if (lmResult.success) {
          installedSkills.push('liquidity-manager');
          console.log('Installed liquidity-manager skill');
        } else {
          errors.push({ skill: 'liquidity-manager', error: lmResult.error });
          console.warn('Failed to install liquidity-manager skill:', lmResult.error);
        }
      } catch (error) {
        errors.push({ skill: 'liquidity-manager', error: error.message });
        console.warn('liquidity-manager skill installation error:', error.message);
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
