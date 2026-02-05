const FLY_API_HOSTNAME = 'https://api.machines.dev';

async function flyRequest(method, path, body = null) {
  const token = process.env.FLY_API_TOKEN;
  if (!token) {
    throw new Error('FLY_API_TOKEN not configured');
  }

  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${FLY_API_HOSTNAME}${path}`, options);
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Fly.io API error (${response.status}): ${errorText}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export const flyService = {
  createApp: async (appName, orgSlug = 'personal') => {
    console.log(`Creating Fly app: ${appName}...`);
    const result = await flyRequest('POST', '/v1/apps', {
      app_name: appName,
      org_slug: orgSlug,
    });
    console.log(`App created: ${appName}`);
    return result;
  },

  deleteApp: async (appName) => {
    console.log(`Deleting Fly app: ${appName}...`);
    await flyRequest('DELETE', `/v1/apps/${appName}`);
    console.log(`App deleted: ${appName}`);
    return true;
  },

  listApps: async (orgSlug = 'personal') => {
    const result = await flyRequest('GET', `/v1/apps?org_slug=${orgSlug}`);
    return result.apps || [];
  },

  createMachine: async (appName, config) => {
    console.log(`Creating machine in app ${appName}...`);
    const result = await flyRequest('POST', `/v1/apps/${appName}/machines`, config);
    console.log(`Machine created: ${result.id}`);
    return result;
  },

  getMachine: async (appName, machineId) => {
    return flyRequest('GET', `/v1/apps/${appName}/machines/${machineId}`);
  },

  listMachines: async (appName) => {
    try {
      const result = await flyRequest('GET', `/v1/apps/${appName}/machines`);
      return result || [];
    } catch (error) {
      if (error.message.includes('no rows in result set') || error.message.includes('not found')) {
        console.log(`App ${appName} not found, returning empty machines list`);
        return [];
      }
      throw error;
    }
  },

  startMachine: async (appName, machineId) => {
    console.log(`Starting machine ${machineId}...`);
    await flyRequest('POST', `/v1/apps/${appName}/machines/${machineId}/start`);
    console.log(`Machine started`);
    return true;
  },

  stopMachine: async (appName, machineId) => {
    console.log(`Stopping machine ${machineId}...`);
    await flyRequest('POST', `/v1/apps/${appName}/machines/${machineId}/stop`);
    console.log(`Machine stopped`);
    return true;
  },

  deleteMachine: async (appName, machineId, force = false) => {
    console.log(`Deleting machine ${machineId}...`);
    const query = force ? '?force=true' : '';
    await flyRequest('DELETE', `/v1/apps/${appName}/machines/${machineId}${query}`);
    console.log(`Machine deleted`);
    return true;
  },

  updateMachine: async (appName, machineId, config) => {
    console.log(`Updating machine ${machineId}...`);
    const result = await flyRequest('POST', `/v1/apps/${appName}/machines/${machineId}`, config);
    console.log(`Machine updated: ${result.id}`);
    return result;
  },

  waitForMachine: async (appName, machineId, targetState = 'started', maxAttempts = 30) => {
    console.log(`Waiting for machine ${machineId} to reach state: ${targetState}...`);
    for (let i = 0; i < maxAttempts; i++) {
      const machine = await flyService.getMachine(appName, machineId);
      console.log(`  Attempt ${i + 1}/${maxAttempts}: State = ${machine.state}`);
      
      if (machine.state === targetState) {
        console.log(`Machine reached target state: ${targetState}`);
        return machine;
      }
      
      if (machine.state === 'failed' || machine.state === 'destroyed') {
        throw new Error(`Machine entered failed state: ${machine.state}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    throw new Error(`Timeout waiting for machine to reach state: ${targetState}`);
  },

  createOpenClawGateway: async (gatewayId, options = {}) => {
    const appName = `openclaw-gw-${gatewayId}`;
    const {
      gatewayToken,
      openrouterApiKey,
      region = 'iad',
      memoryMb = 4096,  // 4GB RAM for better performance
      cpus = 2,
    } = options;

    await flyService.createApp(appName);

    // Allocate public IPs for the app
    await flyService.allocateIps(appName);

    // Create config with actual values baked in (not shell variables)
    const openclawConfig = {
      gateway: {
        auth: {
          mode: 'token',
          token: gatewayToken
        },
        http: {
          endpoints: {
            chatCompletions: { enabled: true }
          }
        }
      }
    };
    
    // Base64 encode config to avoid shell escaping issues
    const configBase64 = Buffer.from(JSON.stringify(openclawConfig)).toString('base64');

    const machineConfig = {
      name: 'gateway',
      config: {
        image: 'ghcr.io/openclaw/openclaw:latest',
        env: {
          NODE_ENV: 'production',
          OPENCLAW_STATE_DIR: '/data',
          OPENCLAW_CONFIG_PATH: '/data/config.json',
          NODE_OPTIONS: '--max-old-space-size=1536',
          OPENAI_BASE_URL: 'https://openrouter.ai/api/v1',
          OPENAI_API_KEY: openrouterApiKey || process.env.OPENROUTER_API_KEY,
          OPENCLAW_CONFIG_B64: configBase64,
          PUPPETEER_EXECUTABLE_PATH: '/usr/bin/chromium-browser',
          PUPPETEER_SKIP_CHROMIUM_DOWNLOAD: 'true',
          CHROMIUM_PATH: '/usr/bin/chromium-browser',
        },
        guest: {
          cpu_kind: 'shared',
          cpus,
          memory_mb: memoryMb,
        },
        services: [
          {
            ports: [
              { port: 443, handlers: ['tls', 'http'] },
              { port: 80, handlers: ['http'] },
            ],
            protocol: 'tcp',
            internal_port: 3000,
          },
        ],
        mounts: [
          {
            volume: `vol_${gatewayId}`,
            path: '/data',
          },
        ],
        restart: {
          policy: 'on-failure',
          max_retries: 10,
        },
        init: {
          cmd: ['sh', '-c', 'apk add --no-cache jq curl chromium >/dev/null 2>&1 || true && mkdir -p /home/node/.openclaw /data/agents/main/agent && if [ ! -f /data/openclaw.json ]; then echo "$OPENCLAW_CONFIG_B64" | base64 -d > /data/openclaw.json; fi && echo "$OPENCLAW_CONFIG_B64" | base64 -d > /home/node/.openclaw/openclaw.json && echo "{\\"openrouter\\":{\\"mode\\":\\"apiKey\\",\\"apiKey\\":\\"$OPENAI_API_KEY\\"}}" > /data/agents/main/agent/auth-profiles.json && exec node dist/index.js gateway --bind lan']
        }
      },
      region,
    };

    const volume = await flyService.createVolume(appName, {
      name: `vol_${gatewayId}`,
      region,
      sizeGb: 1,
    });

    machineConfig.config.mounts[0].volume = volume.id;

    const machine = await flyService.createMachine(appName, machineConfig);

    await flyService.waitForMachine(appName, machine.id, 'started');

    return {
      appName,
      machineId: machine.id,
      volumeId: volume.id,
      endpoint: `https://${appName}.fly.dev`,
      controlUrl: `https://${appName}.fly.dev`,
      region,
    };
  },

  allocateIps: async (appName) => {
    console.log(`Allocating IPs for ${appName}...`);
    const graphqlEndpoint = 'https://api.fly.io/graphql';
    const token = process.env.FLY_API_TOKEN;
    
    const allocateIp = async (type) => {
      const response = await fetch(graphqlEndpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `mutation($appId: ID!, $type: IPAddressType!) { 
            allocateIpAddress(input: { appId: $appId, type: $type }) { 
              ipAddress { id address type } 
            } 
          }`,
          variables: { appId: appName, type },
        }),
      });
      return response.json();
    };

    const [v4Result, v6Result] = await Promise.all([
      allocateIp('v4'),
      allocateIp('v6'),
    ]);

    console.log(`IPs allocated for ${appName}`);
    return {
      v4: v4Result.data?.allocateIpAddress?.ipAddress?.address,
      v6: v6Result.data?.allocateIpAddress?.ipAddress?.address,
    };
  },

  createVolume: async (appName, options) => {
    const { name, region = 'iad', sizeGb = 10 } = options;
    console.log(`Creating volume ${name} in ${appName}...`);
    const result = await flyRequest('POST', `/v1/apps/${appName}/volumes`, {
      name,
      region,
      size_gb: sizeGb,
    });
    console.log(`Volume created: ${result.id}`);
    return result;
  },

  deleteVolume: async (appName, volumeId) => {
    console.log(`Deleting volume ${volumeId}...`);
    await flyRequest('DELETE', `/v1/apps/${appName}/volumes/${volumeId}`);
    console.log(`Volume deleted`);
    return true;
  },

  deleteOpenClawGateway: async (gatewayId) => {
    const appName = `openclaw-gw-${gatewayId}`;
    
    try {
      const machines = await flyService.listMachines(appName);
      for (const machine of machines) {
        await flyService.deleteMachine(appName, machine.id, true);
      }
    } catch (error) {
      console.warn(`Failed to delete machines: ${error.message}`);
    }

    await flyService.deleteApp(appName);
    return true;
  },

  updateGatewayConfig: async (gatewayId, gatewayToken) => {
    const appName = `openclaw-gw-${gatewayId}`;
    
    const machines = await flyService.listMachines(appName);
    if (machines.length === 0) {
      throw new Error('No machines found for gateway');
    }
    
    const machine = machines[0];
    const openrouterApiKey = process.env.OPENROUTER_API_KEY;
    
    // Create config with actual values baked in
    const openclawConfig = {
      gateway: {
        auth: {
          mode: 'token',
          token: gatewayToken
        },
        http: {
          endpoints: {
            chatCompletions: { enabled: true }
          }
        }
      }
    };
    
    // Base64 encode config to avoid shell escaping issues
    const configBase64 = Buffer.from(JSON.stringify(openclawConfig)).toString('base64');
    
    const updatedConfig = {
      config: {
        ...machine.config,
        env: {
          NODE_ENV: 'production',
          OPENCLAW_STATE_DIR: '/data',
          OPENCLAW_CONFIG_PATH: '/data/config.json',
          NODE_OPTIONS: '--max-old-space-size=1536',
          OPENAI_BASE_URL: 'https://openrouter.ai/api/v1',
          OPENAI_API_KEY: openrouterApiKey,
          OPENCLAW_CONFIG_B64: configBase64,
          PUPPETEER_EXECUTABLE_PATH: '/usr/bin/chromium-browser',
          PUPPETEER_SKIP_CHROMIUM_DOWNLOAD: 'true',
          CHROMIUM_PATH: '/usr/bin/chromium-browser',
        },
        init: {
          cmd: ['sh', '-c', 'apk add --no-cache jq curl chromium >/dev/null 2>&1 || true && mkdir -p /home/node/.openclaw /data/agents/main/agent && if [ ! -f /data/openclaw.json ]; then echo "$OPENCLAW_CONFIG_B64" | base64 -d > /data/openclaw.json; fi && echo "$OPENCLAW_CONFIG_B64" | base64 -d > /home/node/.openclaw/openclaw.json && echo "{\\"openrouter\\":{\\"mode\\":\\"apiKey\\",\\"apiKey\\":\\"$OPENAI_API_KEY\\"}}" > /data/agents/main/agent/auth-profiles.json && exec node dist/index.js gateway --bind lan']
        }
      },
    };
    
    console.log(`Updating gateway ${gatewayId} machine config...`);
    await flyService.stopMachine(appName, machine.id);
    await new Promise(resolve => setTimeout(resolve, 5000));
    const result = await flyService.updateMachine(appName, machine.id, updatedConfig);
    
    // Wait for auto-restart after update
    console.log('Waiting for gateway to restart...');
    await new Promise(resolve => setTimeout(resolve, 15000));
    await flyService.waitForMachine(appName, machine.id, 'started', 60);
    console.log(`Gateway ${gatewayId} updated successfully`);
    
    return result;
  },

  getGatewayStatus: async (gatewayId) => {
    const appName = `openclaw-gw-${gatewayId}`;
    
    try {
      const machines = await flyService.listMachines(appName);
      if (machines.length === 0) {
        return { status: 'not_found', appName };
      }
      
      const machine = machines[0];
      return {
        status: machine.state,
        appName,
        machineId: machine.id,
        endpoint: `https://${appName}.fly.dev`,
        region: machine.region,
      };
    } catch (error) {
      return { status: 'error', error: error.message };
    }
  },

  execCommand: async (appName, machineId, command, timeout = 30000) => {
    console.log(`Executing command on ${appName}/${machineId}: ${command.substring(0, 100)}...`);
    
    const result = await flyRequest('POST', `/v1/apps/${appName}/machines/${machineId}/exec`, {
      command: ['sh', '-c', `cd /app && ${command}`],
      timeout: Math.floor(timeout / 1000),
    });
    
    if (result.exit_code !== 0) {
      console.error(`Command failed with exit code ${result.exit_code}: ${result.stderr}`);
      throw new Error(`Command failed: ${result.stderr || 'Unknown error'}`);
    }
    
    return result;
  },

  execOnGateway: async (gatewayId, command, timeout = 30000) => {
    const appName = `openclaw-gw-${gatewayId}`;
    
    const machines = await flyService.listMachines(appName);
    if (machines.length === 0) {
      throw new Error(`No machines found for gateway ${gatewayId}`);
    }
    
    const machine = machines[0];
    if (machine.state !== 'started') {
      throw new Error(`Gateway machine is not running (state: ${machine.state})`);
    }
    
    return flyService.execCommand(appName, machine.id, command, timeout);
  },

  restartGateway: async (gatewayId) => {
    const appName = `openclaw-gw-${gatewayId}`;
    console.log(`Restarting gateway ${gatewayId}...`);
    
    const machines = await flyService.listMachines(appName);
    if (machines.length === 0) {
      throw new Error(`No machines found for gateway ${gatewayId}`);
    }
    
    const machine = machines[0];
    
    // Stop and start the machine to reload config
    await flyService.stopMachine(appName, machine.id);
    await new Promise(resolve => setTimeout(resolve, 3000));
    await flyService.startMachine(appName, machine.id);
    
    // Wait for gateway to be ready (takes ~45-90 seconds)
    console.log(`Waiting for gateway to start...`);
    await flyService.waitForMachine(appName, machine.id, 'started', 60);
    
    // Give extra time for the gateway process to initialize
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    console.log(`Gateway ${gatewayId} restarted successfully`);
    return true;
  },

  // Per-user gateway: Each user gets their own dedicated Fly.io machine
  createUserGateway: async (userId, options = {}) => {
    const shortUserId = userId.replace(/[^a-z0-9]/gi, '').substring(0, 12).toLowerCase();
    const appName = `oc-user-${shortUserId}-${Date.now().toString(36)}`;
    
    const {
      model = 'openrouter/openai/gpt-4o',
      systemPrompt = 'You are a helpful assistant.',
      botName = 'Molty',
      region = 'iad',
      memoryMb = 4096,  // 4GB RAM for better performance
      cpus = 2,         // 2 shared CPUs
      openrouterApiKey = null,
      tokenSymbol = null,
      tokenName = null,
      agentWalletAddress = null,
      telegramBotToken = null,
    } = options;

    console.log(`Creating per-user gateway for ${userId}: ${appName}...`);

    // Generate unique token for this user's gateway
    const crypto = await import('crypto');
    const gatewayToken = crypto.randomBytes(32).toString('hex');
    // Use user's provisioned key if available, otherwise fallback to shared key
    const effectiveApiKey = openrouterApiKey || process.env.OPENROUTER_API_KEY;
    const openrouterModel = model.startsWith('openrouter/') ? model : `openrouter/${model}`;

    // Create the Fly.io app
    await flyService.createApp(appName);

    // Allocate public IPs
    await flyService.allocateIps(appName);

    // Create volume for persistent data
    const volume = await flyService.createVolume(appName, {
      name: 'user_data',
      region,
      sizeGb: 1,
    });

    // Build enhanced system prompt with agent context
    let enhancedSystemPrompt = systemPrompt;
    const contextParts = [];
    if (botName) contextParts.push(`Your name is ${botName}.`);
    if (tokenSymbol) contextParts.push(`You have a token called $${tokenSymbol}${tokenName ? ` (${tokenName})` : ''}.`);
    if (agentWalletAddress) contextParts.push(`Your wallet address is ${agentWalletAddress}.`);
    contextParts.push(`You have access to the bankr skill for crypto trading. Use it when users ask about trading or swapping tokens.`);
    
    if (contextParts.length > 0) {
      enhancedSystemPrompt = contextParts.join(' ') + '\n\n' + systemPrompt;
    }

    // Create gateway config with model, skills, and enhanced system prompt
    const openclawConfig = {
      gateway: {
        bind: 'lan',
        port: 18789,
        trustedProxies: ['0.0.0.0/0', '::/0'],
        controlUi: {
          enabled: true,
          allowInsecureAuth: true
        }
      },
      agents: {
        defaults: {
          model: {
            primary: openrouterModel
          },
          sandbox: {
            mode: 'off'
          }
        }
      },
      tools: {
        agentToAgent: {
          enabled: true,
          allow: ['*']
        }
      },
      skills: {
        install: {
          nodeManager: 'npm'
        },
        entries: {
          bankr: {
            enabled: true,
            env: {
              BANKR_API_KEY: process.env.BANKR_API_KEY || '',
              BANKR_API_URL: 'https://api.bankr.bot',
              WALLET_ADDRESS: agentWalletAddress || ''
            }
          }
        }
      },
      ...(telegramBotToken ? {
        channels: {
          telegram: {
            enabled: true,
            botToken: telegramBotToken
          }
        }
      } : {})
    };
    
    // Base64 encode the config to avoid shell escaping issues
    const configBase64 = Buffer.from(JSON.stringify(openclawConfig)).toString('base64');
    
    // Build AGENTS.md content for agent identity (OpenClaw uses bootstrap files for system prompt)
    // Bankr skill is pre-installed in workspace/skills/bankr/
    const bankrUsageInstruction = `

## Crypto Trading (Bankr Skill)

The bankr skill is pre-installed and ready to use. To execute crypto commands, use the skill's scripts via exec:

\`\`\`bash
scripts/bankr.sh "What is the price of ETH?"
\`\`\`

The scripts are in your workspace at skills/bankr/scripts/. Use them for:
- Check prices: scripts/bankr.sh "What is the price of ETH?"
- Trade tokens: scripts/bankr.sh "Buy $10 of ETH on Base"
- Portfolio: scripts/bankr.sh "Show my portfolio"
- NFTs, leverage trading, Polymarket, and more

The skill config with API credentials is at skills/bankr/config.json.
`;
    const agentsContent = (enhancedSystemPrompt || 'You are a helpful AI assistant.') + bankrUsageInstruction;
    const agentsBase64 = Buffer.from(agentsContent).toString('base64');
    
    // Build bankr SKILL.md content
    const bankrSkillMd = `---
name: bankr
description: AI-powered crypto trading agent via natural language. Use when the user wants to trade crypto (buy/sell/swap tokens), check portfolio balances, view token prices, transfer crypto, or manage DeFi operations.
metadata:
  openclaw:
    emoji: "💰"
    homepage: "https://bankr.bot"
    requires: { "bins": ["curl", "jq"] }
---

# Bankr Crypto Trading Skill

Execute crypto trading and DeFi operations using natural language through the Bankr API.

## IMPORTANT: How to Execute

**ALWAYS use the \`exec\` tool to run shell commands. NEVER use sessions_spawn.**

To use this skill, call exec with the bankr script:

\`\`\`json
{
  "tool": "exec",
  "arguments": {
    "command": "{baseDir}/bin/bankr.sh",
    "args": ["What is the price of ETH?"]
  }
}
\`\`\`

Or in a single command string:
\`\`\`json
{
  "tool": "exec", 
  "arguments": {
    "command": "{baseDir}/bin/bankr.sh \\"What is the price of ETH?\\""
  }
}
\`\`\`

The script returns JSON. Parse it and respond to the user naturally.

## When to Use

Use this skill when the user asks about:
- Crypto prices (e.g., "What's the price of ETH?", "How much is Bitcoin?")
- Trading tokens (e.g., "Buy ETH", "Swap USDC for ETH")
- Portfolio balances (e.g., "Show my portfolio", "What's my balance?")
- Sending crypto (e.g., "Send 0.1 ETH to vitalik.eth")

## Example Commands

Check ETH price:
\`\`\`
exec: {baseDir}/bin/bankr.sh "What is the current price of Ethereum?"
\`\`\`

Check portfolio:
\`\`\`
exec: {baseDir}/bin/bankr.sh "Show my portfolio balances"
\`\`\`

Buy tokens:
\`\`\`
exec: {baseDir}/bin/bankr.sh "Buy $50 of ETH on Base"
\`\`\`

## Supported Operations

- **Trading**: Buy/sell/swap tokens, limit orders, DCA
- **Portfolio**: Check balances, view USD valuations
- **Market Research**: Token prices, trending tokens
- **Transfers**: Send to addresses, ENS, or social handles
- **Chains**: Base, Ethereum, Polygon, Solana, Unichain
`;
    const bankrSkillBase64 = Buffer.from(bankrSkillMd).toString('base64');

    // Build bankr.sh script
    const bankrScript = `#!/bin/bash
# Bankr Agent API wrapper
set -euo pipefail
export PATH="/home/node/.local/bin:\$PATH"
SKILL_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_FILE="\$SKILL_DIR/config.json"
API_KEY=$(jq -r '.apiKey' "\$CONFIG_FILE")
API_URL=$(jq -r '.apiUrl // "https://api.bankr.bot"' "\$CONFIG_FILE")
PROMPT="\$*"
[ -z "\$PROMPT" ] && { echo '{"error": "Usage: bankr.sh <prompt>"}'; exit 1; }
RESULT=$(curl -sf -X POST "\${API_URL}/agent/prompt" -H "X-API-Key: \${API_KEY}" -H "Content-Type: application/json" -d "$(jq -nc --arg p "\$PROMPT" '{prompt:\$p}')")
JOB_ID=$(echo "\$RESULT" | jq -r '.jobId // empty')
[ -z "\$JOB_ID" ] && { echo "\$RESULT"; exit 1; }
for i in {1..150}; do
  sleep 2
  STATUS=$(curl -sf -X GET "\${API_URL}/agent/job/\${JOB_ID}" -H "X-API-Key: \${API_KEY}")
  STATE=$(echo "\$STATUS" | jq -r '.status')
  case "\$STATE" in
    completed|failed|cancelled) echo "\$STATUS"; exit 0;;
  esac
done
echo '{"error": "Timeout"}'; exit 1
`;
    const bankrScriptBase64 = Buffer.from(bankrScript).toString('base64');
    
    // Init command: 
    // 1. Decode base64 config using Node.js (guaranteed available in openclaw image)
    // 2. Write auth-profiles.json with OpenRouter API key
    // 3. Write AGENTS.md for agent identity
    // 4. Install bankr skill files
    // 5. Start gateway with --allow-unconfigured and --token
    // Install bankr skill in workspace/skills directory (correct OpenClaw path)
    const initCmd = [
      // Install jq for skill scripts to user-writable location (container runs as non-root 'node' user)
      'mkdir -p /home/node/.local/bin',
      'export PATH="/home/node/.local/bin:$PATH"',
      '(which jq >/dev/null 2>&1 || (curl -sL https://github.com/jqlang/jq/releases/download/jq-1.7.1/jq-linux-amd64 -o /home/node/.local/bin/jq && chmod +x /home/node/.local/bin/jq))',
      'jq --version || echo "jq not available, bankr skill may have limited functionality"',
      'mkdir -p /home/node/.openclaw/workspace/skills/bankr/scripts /data/agents/main/agent',
      'node -e "require(\'fs\').writeFileSync(\'/home/node/.openclaw/openclaw.json\', Buffer.from(process.env.OPENCLAW_CONFIG_B64, \'base64\').toString())"',
      'node -e "require(\'fs\').writeFileSync(\'/home/node/.openclaw/workspace/AGENTS.md\', Buffer.from(process.env.AGENTS_MD_B64, \'base64\').toString())"',
      'printf \'{"version":1,"profiles":{"openrouter:default":{"type":"api_key","provider":"openrouter","key":"%s"}},"lastGood":{"openrouter":"openrouter:default"}}\' "$OPENROUTER_API_KEY" > /data/agents/main/agent/auth-profiles.json',
      'cp /data/agents/main/agent/auth-profiles.json /home/node/.openclaw/auth-profiles.json',
      // Download bankr skill files from GitHub
      'echo "=== INSTALLING BANKR SKILL ==="',
      'curl -sL https://raw.githubusercontent.com/BankrBot/openclaw-skills/main/bankr/SKILL.md -o /home/node/.openclaw/workspace/skills/bankr/SKILL.md',
      'curl -sL https://raw.githubusercontent.com/BankrBot/openclaw-skills/main/bankr/scripts/bankr.sh -o /home/node/.openclaw/workspace/skills/bankr/scripts/bankr.sh',
      'curl -sL https://raw.githubusercontent.com/BankrBot/openclaw-skills/main/bankr/scripts/bankr-submit.sh -o /home/node/.openclaw/workspace/skills/bankr/scripts/bankr-submit.sh',
      'curl -sL https://raw.githubusercontent.com/BankrBot/openclaw-skills/main/bankr/scripts/bankr-status.sh -o /home/node/.openclaw/workspace/skills/bankr/scripts/bankr-status.sh',
      // Inject PATH into downloaded scripts so they can find jq in user's local bin
      'for f in /home/node/.openclaw/workspace/skills/bankr/scripts/*.sh; do sed -i \'2i export PATH="/home/node/.local/bin:$PATH"\' "$f"; done',
      'chmod +x /home/node/.openclaw/workspace/skills/bankr/scripts/*.sh',
      // Create config.json with Bankr API key
      'printf \'{"apiKey":"%s","apiUrl":"https://api.bankr.bot"}\' "$BANKR_API_KEY" > /home/node/.openclaw/workspace/skills/bankr/config.json',
      'echo "=== BANKR SKILL INSTALLED ==="',
      'ls -la /home/node/.openclaw/workspace/skills/bankr/',
      'cat /home/node/.openclaw/workspace/skills/bankr/SKILL.md | head -50',
      'echo "=== STARTING GATEWAY ==="',
      'exec node dist/index.js gateway --allow-unconfigured --token "$OPENCLAW_GATEWAY_TOKEN"'
    ].join(' && ');

    const machineConfig = {
      name: 'user-gateway',
      config: {
        image: 'ghcr.io/openclaw/openclaw:latest',
        env: {
          NODE_ENV: 'production',
          OPENCLAW_STATE_DIR: '/data',
          NODE_OPTIONS: '--max-old-space-size=1536',
          OPENCLAW_GATEWAY_TOKEN: gatewayToken,
          OPENROUTER_API_KEY: effectiveApiKey,
          BANKR_API_KEY: process.env.BANKR_API_KEY || '',
          OPENCLAW_CONFIG_B64: configBase64,
          AGENTS_MD_B64: agentsBase64,
        },
        guest: {
          cpu_kind: 'shared',
          cpus,
          memory_mb: memoryMb,
        },
        services: [
          {
            ports: [
              { port: 443, handlers: ['tls', 'http'], tls_options: { alpn: ['h2', 'http/1.1'] } },
              { port: 80, handlers: ['http'] },
            ],
            protocol: 'tcp',
            internal_port: 18789,
            autostart: true,
            force_instance_key: null,
          },
        ],
        mounts: [
          {
            volume: volume.id,
            path: '/data',
          },
        ],
        restart: {
          policy: 'on-failure',
          max_retries: 5,
        },
        init: {
          cmd: ['sh', '-c', initCmd]
        }
      },
      region,
    };

    const machine = await flyService.createMachine(appName, machineConfig);

    // Wait for machine to start (OpenClaw takes ~60-90 seconds to boot)
    await flyService.waitForMachine(appName, machine.id, 'started', 60);

    const endpoint = `https://${appName}.fly.dev`;

    console.log(`Per-user gateway created: ${endpoint}`);

    return {
      appName,
      machineId: machine.id,
      volumeId: volume.id,
      endpoint,
      gatewayToken,
      controlUrl: `${endpoint}/?token=${gatewayToken}`,
      region,
      model: openrouterModel,
      telegramConfigured: !!telegramBotToken,
      telegramUsername: null,
    };
  },

  deleteUserGateway: async (appName) => {
    console.log(`Deleting user gateway: ${appName}...`);
    
    try {
      const machines = await flyService.listMachines(appName);
      for (const machine of machines) {
        await flyService.deleteMachine(appName, machine.id, true);
      }
    } catch (error) {
      console.warn(`Failed to delete machines: ${error.message}`);
    }

    try {
      await flyService.deleteApp(appName);
      console.log(`User gateway deleted: ${appName}`);
    } catch (error) {
      console.warn(`Failed to delete app: ${error.message}`);
    }

    return true;
  },

  getUserGatewayStatus: async (appName) => {
    try {
      const machines = await flyService.listMachines(appName);
      if (machines.length === 0) {
        return { status: 'not_found', appName };
      }
      
      const machine = machines[0];
      return {
        status: machine.state,
        appName,
        machineId: machine.id,
        endpoint: `https://${appName}.fly.dev`,
        region: machine.region,
      };
    } catch (error) {
      return { status: 'error', error: error.message };
    }
  },

  updateUserGateway: async (appName, options = {}) => {
    const {
      model,
      systemPrompt,
      gatewayToken,
    } = options;

    if (!model && !systemPrompt) {
      console.log('No model/systemPrompt changes, skipping gateway update');
      return { success: true, updated: false };
    }

    console.log(`Updating user gateway ${appName} config...`);

    try {
      const machines = await flyService.listMachines(appName);
      if (machines.length === 0) {
        throw new Error('No machines found for gateway');
      }

      const machine = machines[0];
      const currentConfig = machine.config;
      const openrouterApiKey = process.env.OPENROUTER_API_KEY;

      // Build new OpenClaw config with updated model/systemPrompt
      // Binding is done via CLI args, not config
      const openrouterModel = model && (model.startsWith('openrouter/') ? model : `openrouter/${model}`);
      
      const openclawConfig = {
        gateway: {
          mode: 'local',
          auth: {
            mode: 'token',
            token: gatewayToken
          },
          trustedProxies: ['0.0.0.0/0', '::/0'],
          controlUi: {
            enabled: true,
            allowInsecureAuth: true
          },
          http: {
            endpoints: {
              chatCompletions: { enabled: true }
            }
          }
        },
        agents: {
          defaults: {
            model: {
              primary: openrouterModel || 'openrouter/openai/gpt-4o'
            }
          }
        }
      };

      const configBase64 = Buffer.from(JSON.stringify(openclawConfig)).toString('base64');

      // Update machine env vars with new config
      const updatedConfig = {
        ...currentConfig,
        env: {
          ...currentConfig.env,
          OPENCLAW_CONFIG_B64: configBase64,
        },
      };

      await flyService.updateMachine(appName, machine.id, { config: updatedConfig });
      
      // Restart machine to apply changes
      await flyService.restartMachine(appName, machine.id);
      await flyService.waitForMachine(appName, machine.id, 'started', 30);

      console.log(`User gateway ${appName} updated and restarted`);
      return { success: true, updated: true };
    } catch (error) {
      console.error(`Failed to update user gateway: ${error.message}`);
      throw error;
    }
  },

  restartMachine: async (appName, machineId) => {
    console.log(`Restarting machine ${machineId}...`);
    await flyRequest('POST', `/v1/apps/${appName}/machines/${machineId}/restart`);
    console.log(`Machine restart initiated: ${machineId}`);
  },
};
