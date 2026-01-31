import axios from 'axios';
import crypto from 'crypto';

const RAILWAY_API_URL = 'https://backboard.railway.com/graphql/v2';
const RAILWAY_API_TOKEN = process.env.RAILWAY_API_TOKEN;

const railwayClient = axios.create({
  baseURL: RAILWAY_API_URL,
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${RAILWAY_API_TOKEN}`,
  },
});

async function graphqlRequest(query, variables = {}) {
  const response = await railwayClient.post('', { query, variables });
  if (response.data.errors) {
    const errorMsg = response.data.errors.map(e => e.message).join(', ');
    throw new Error(`Railway API: ${errorMsg}`);
  }
  return response.data.data;
}

export const railwayService = {
  createBotService: async (userId, botId, openrouterApiKey, config = {}) => {
    try {
      console.log(`Creating Railway service for bot ${botId}...`);

      const serviceName = `openclaw-${botId.substring(0, 8)}`;
      const setupPassword = crypto.randomBytes(16).toString('hex');
      const gatewayToken = crypto.randomBytes(32).toString('hex');
      const projectId = process.env.RAILWAY_PROJECT_ID;
      const environmentId = process.env.RAILWAY_ENVIRONMENT_ID;

      const createResult = await graphqlRequest(`
        mutation ServiceCreate($input: ServiceCreateInput!) {
          serviceCreate(input: $input) {
            id
            name
          }
        }
      `, {
        input: {
          projectId,
          name: serviceName,
          source: {
            image: 'ghcr.io/clawdhub/openclaw-gateway:latest'
          }
        }
      });

      const service = createResult.serviceCreate;
      const serviceId = service.id;
      console.log(`Service created: ${serviceId} (${service.name})`);

      await railwayService.upsertVariables(serviceId, projectId, environmentId, {
        PORT: '8080',
        SETUP_PASSWORD: setupPassword,
        OPENCLAW_STATE_DIR: '/data/.openclaw',
        OPENCLAW_WORKSPACE_DIR: '/data/workspace',
        OPENCLAW_GATEWAY_TOKEN: gatewayToken,
        OPENAI_BASE_URL: 'https://openrouter.ai/api/v1',
        OPENAI_API_KEY: openrouterApiKey,
        OPENAI_MODEL: config.model || 'openai/gpt-3.5-turbo',
        SYSTEM_PROMPT: config.systemPrompt || 'You are a helpful assistant.',
        BOT_NAME: config.botName || `Bot ${botId.substring(0, 8)}`,
      });

      await railwayService.createVolume(serviceId, projectId, environmentId, '/data');

      const domain = await railwayService.createServiceDomain(serviceId, environmentId);
      const endpoint = `https://${domain}`;

      let status = 'creating';
      try {
        await railwayService.deployService(serviceId, environmentId);
        await railwayService.waitForDeployment(serviceId, environmentId);
        status = 'running';
        console.log(`Service deployed at ${endpoint}`);
      } catch (deployError) {
        if (deployError.message.includes('rate limit')) {
          console.warn(`Deployment rate limited - service created but pending. URL: ${endpoint}`);
          status = 'pending';
        } else {
          throw deployError;
        }
      }

      return {
        railwayServiceId: serviceId,
        botId,
        userId,
        endpoint,
        setupPassword,
        setupUrl: `${endpoint}/setup`,
        controlUrl: `${endpoint}/openclaw`,
        createdAt: new Date().toISOString(),
        status,
      };
    } catch (error) {
      console.error(`Failed to create Railway service: ${error.message}`);
      throw error;
    }
  },

  upsertVariables: async (serviceId, projectId, environmentId, variables) => {
    console.log(`Setting ${Object.keys(variables).length} environment variables...`);
    console.log(`  Project: ${projectId}, Environment: ${environmentId}, Service: ${serviceId}`);
    
    const criticalVars = ['PORT', 'SETUP_PASSWORD', 'OPENAI_API_KEY', 'OPENAI_BASE_URL'];
    let failedCount = 0;
    
    for (const [name, value] of Object.entries(variables)) {
      try {
        await graphqlRequest(`
          mutation VariableUpsert($input: VariableUpsertInput!) {
            variableUpsert(input: $input)
          }
        `, {
          input: {
            projectId,
            environmentId,
            serviceId,
            name,
            value,
          }
        });
        console.log(`  Set ${name}`);
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        console.error(`  Failed to set ${name}: ${error.message}`);
        if (criticalVars.includes(name)) {
          throw error;
        }
        failedCount++;
      }
    }
    console.log(`Variables set (${failedCount} non-critical failures)`);
  },

  createVolume: async (serviceId, projectId, environmentId, mountPath) => {
    console.log(`Creating volume at ${mountPath}...`);
    try {
      const result = await graphqlRequest(`
        mutation VolumeCreate($input: VolumeCreateInput!) {
          volumeCreate(input: $input) {
            id
          }
        }
      `, {
        input: {
          projectId,
          environmentId,
          serviceId,
          mountPath,
        }
      });
      console.log(`Volume created: ${result.volumeCreate?.id}`);
      return result.volumeCreate;
    } catch (error) {
      console.warn(`Volume creation warning: ${error.message}`);
    }
  },

  createServiceDomain: async (serviceId, environmentId) => {
    console.log(`Creating service domain...`);
    const result = await graphqlRequest(`
      mutation ServiceDomainCreate($input: ServiceDomainCreateInput!) {
        serviceDomainCreate(input: $input) {
          id
          domain
        }
      }
    `, {
      input: {
        serviceId,
        environmentId,
      }
    });

    const domain = result.serviceDomainCreate.domain;
    console.log(`Domain created: ${domain}`);
    return domain;
  },

  deployService: async (serviceId, environmentId) => {
    console.log(`Triggering deployment...`);
    await graphqlRequest(`
      mutation ServiceInstanceDeployV2($serviceId: String!, $environmentId: String!) {
        serviceInstanceDeployV2(serviceId: $serviceId, environmentId: $environmentId)
      }
    `, { serviceId, environmentId });
    console.log(`Deployment triggered`);
  },

  waitForDeployment: async (serviceId, environmentId, maxAttempts = 60) => {
    console.log(`Waiting for deployment to be ready...`);

    for (let i = 0; i < maxAttempts; i++) {
      try {
        const result = await graphqlRequest(`
          query ServiceInstance($serviceId: String!, $environmentId: String!) {
            serviceInstance(serviceId: $serviceId, environmentId: $environmentId) {
              latestDeployment {
                id
                status
              }
            }
          }
        `, { serviceId, environmentId });

        const deployment = result.serviceInstance?.latestDeployment;
        const status = deployment?.status;

        if (status === 'SUCCESS') {
          console.log(`Deployment ready!`);
          return true;
        }

        if (status === 'FAILED' || status === 'CRASHED') {
          throw new Error(`Deployment ${status}`);
        }

        console.log(`  Attempt ${i + 1}/${maxAttempts}: Status = ${status || 'pending'}...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      } catch (queryError) {
        if (queryError.message.includes('Deployment')) throw queryError;
        console.log(`  Attempt ${i + 1}/${maxAttempts}: Waiting...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    console.warn(`Deployment still in progress after ${maxAttempts} attempts`);
    return false;
  },

  getServiceStatus: async (railwayServiceId) => {
    const environmentId = process.env.RAILWAY_ENVIRONMENT_ID;
    try {
      const result = await graphqlRequest(`
        query ServiceInstance($serviceId: String!, $environmentId: String!) {
          serviceInstance(serviceId: $serviceId, environmentId: $environmentId) {
            serviceName
            latestDeployment {
              id
              status
            }
          }
          service(id: $serviceId) {
            serviceDomains {
              edges {
                node {
                  domain
                }
              }
            }
          }
        }
      `, { serviceId: railwayServiceId, environmentId });

      const deployment = result.serviceInstance?.latestDeployment;
      const domain = result.service?.serviceDomains?.edges?.[0]?.node?.domain;

      return {
        railwayServiceId,
        status: deployment?.status || 'unknown',
        endpoint: domain ? `https://${domain}` : null,
      };
    } catch (error) {
      console.error(`Failed to get service status: ${error.message}`);
      throw error;
    }
  },

  deleteService: async (railwayServiceId) => {
    try {
      console.log(`Deleting service ${railwayServiceId}...`);
      await graphqlRequest(`
        mutation ServiceDelete($id: String!) {
          serviceDelete(id: $id)
        }
      `, { id: railwayServiceId });
      console.log(`Service deleted`);
      return true;
    } catch (error) {
      console.error(`Failed to delete service: ${error.message}`);
      throw error;
    }
  },

  listAllServices: async () => {
    const projectId = process.env.RAILWAY_PROJECT_ID;
    try {
      const result = await graphqlRequest(`
        query Project($id: String!) {
          project(id: $id) {
            services {
              edges {
                node {
                  id
                  name
                  createdAt
                }
              }
            }
          }
        }
      `, { id: projectId });

      const services = result.project?.services?.edges?.map(e => e.node) || [];
      return services;
    } catch (error) {
      console.error(`Failed to list services: ${error.message}`);
      throw error;
    }
  },

  deleteAllOpenclawServices: async () => {
    console.log('Listing all services in Railway project...');
    const services = await railwayService.listAllServices();
    const openclawServices = services.filter(s => s.name.startsWith('openclaw-'));
    
    console.log(`Found ${openclawServices.length} OpenClaw services to delete`);
    
    const results = [];
    for (const service of openclawServices) {
      try {
        await railwayService.deleteService(service.id);
        results.push({ id: service.id, name: service.name, deleted: true });
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        results.push({ id: service.id, name: service.name, deleted: false, error: error.message });
      }
    }
    
    return results;
  },

  updateServiceConfig: async (railwayServiceId, config) => {
    const projectId = process.env.RAILWAY_PROJECT_ID;
    const environmentId = process.env.RAILWAY_ENVIRONMENT_ID;
    
    const updates = {};
    if (config.systemPrompt) updates.SYSTEM_PROMPT = config.systemPrompt;
    if (config.model) updates.OPENAI_MODEL = config.model;
    if (config.botName) updates.BOT_NAME = config.botName;

    if (Object.keys(updates).length > 0) {
      await railwayService.upsertVariables(railwayServiceId, projectId, environmentId, updates);
      await railwayService.deployService(railwayServiceId, environmentId);
      console.log(`Configuration updated`);
    }

    return true;
  },
};
