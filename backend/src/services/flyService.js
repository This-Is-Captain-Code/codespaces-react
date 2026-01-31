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
    const result = await flyRequest('GET', `/v1/apps/${appName}/machines`);
    return result || [];
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
      setupPassword,
      gatewayToken,
      openrouterApiKey,
      region = 'iad',
      memoryMb = 4096,
      cpus = 2,
    } = options;

    await flyService.createApp(appName);

    const machineConfig = {
      name: 'gateway',
      config: {
        image: 'ghcr.io/openclaw/openclaw:latest',
        env: {
          PORT: '8080',
          SETUP_PASSWORD: setupPassword,
          OPENCLAW_STATE_DIR: '/data/.openclaw',
          OPENCLAW_WORKSPACE_DIR: '/data/workspace',
          OPENCLAW_GATEWAY_TOKEN: gatewayToken,
          OPENAI_BASE_URL: 'https://openrouter.ai/api/v1',
          OPENAI_API_KEY: openrouterApiKey || process.env.OPENROUTER_API_KEY,
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
            internal_port: 8080,
          },
        ],
        mounts: [
          {
            volume: `vol_${gatewayId}`,
            path: '/data',
          },
        ],
      },
      region,
    };

    const volume = await flyService.createVolume(appName, {
      name: `vol_${gatewayId}`,
      region,
      sizeGb: 10,
    });

    machineConfig.config.mounts[0].volume = volume.id;

    const machine = await flyService.createMachine(appName, machineConfig);

    await flyService.waitForMachine(appName, machine.id, 'started');

    return {
      appName,
      machineId: machine.id,
      volumeId: volume.id,
      endpoint: `https://${appName}.fly.dev`,
      setupUrl: `https://${appName}.fly.dev/setup`,
      controlUrl: `https://${appName}.fly.dev/openclaw`,
      region,
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
};
