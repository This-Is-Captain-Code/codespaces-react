import axios from 'axios';

const RAILWAY_API_URL = 'https://backend.railway.app/graphql';
const RAILWAY_API_TOKEN = process.env.RAILWAY_API_TOKEN;

/**
 * Railway Service Integration
 * Manages bot services on Railway platform
 */

const railwayClient = axios.create({
  baseURL: RAILWAY_API_URL,
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${RAILWAY_API_TOKEN}`,
  },
});

export const railwayService = {
  /**
   * Create a new Railway service for a bot
   * @param {string} userId - User ID
   * @param {string} botId - Bot ID
   * @param {string} openrouterApiKey - OpenRouter API key
   * @param {Object} config - Bot configuration
   * @returns {Promise<Object>} Service info with endpoint URL
   */
  createBotService: async (userId, botId, openrouterApiKey, config = {}) => {
    try {
      console.log(`🚀 Creating Railway service for bot ${botId}...`);

      // Query to create a new service
      const query = `
        mutation CreateService($input: ServiceCreateInput!) {
          serviceCreate(input: $input) {
            service {
              id
              name
              createdAt
            }
          }
        }
      `;

      const variables = {
        input: {
          name: `bot-${botId.substring(0, 8)}`,
          templateId: process.env.RAILWAY_OPENCLAW_TEMPLATE_ID,
          environmentId: process.env.RAILWAY_ENVIRONMENT_ID,
          projectId: process.env.RAILWAY_PROJECT_ID,
        },
      };

      const response = await railwayClient.post('', {
        query,
        variables,
      });

      if (response.data.errors) {
        throw new Error(`Railway API error: ${response.data.errors[0].message}`);
      }

      const service = response.data.data.serviceCreate.service;
      console.log(`✅ Service created: ${service.id}`);

      // Set environment variables for the service
      await railwayService.setServiceEnvironmentVariables(
        service.id,
        userId,
        botId,
        openrouterApiKey,
        config
      );

      // Deploy the service
      await railwayService.deployService(service.id);

      // Wait for service to be healthy
      const endpoint = await railwayService.waitForServiceHealth(service.id);

      return {
        railwayServiceId: service.id,
        botId,
        userId,
        endpoint,
        createdAt: new Date().toISOString(),
        status: 'running',
      };
    } catch (error) {
      console.error(`❌ Failed to create Railway service: ${error.message}`);
      throw error;
    }
  },

  /**
   * Set environment variables for a Railway service
   */
  setServiceEnvironmentVariables: async (
    railwayServiceId,
    userId,
    botId,
    openrouterApiKey,
    config
  ) => {
    try {
      console.log(`⚙️  Setting environment variables...`);

      const mutation = `
        mutation UpsertVariables($input: VariableCollectionUpsertInput!) {
          variableCollectionUpsert(input: $input) {
            variableCollection {
              id
            }
          }
        }
      `;

      const variables = {
        input: {
          serviceId: railwayServiceId,
          environmentId: process.env.RAILWAY_ENVIRONMENT_ID,
          variables: {
            OPENAI_BASE_URL: 'https://openrouter.ai/api/v1',
            OPENAI_API_KEY: openrouterApiKey,
            BOT_ID: botId,
            USER_ID: userId,
            BOT_NAME: config.botName || `Bot ${botId.substring(0, 8)}`,
            BOT_MODEL: config.model || 'gpt-3.5-turbo',
            SYSTEM_PROMPT: config.systemPrompt || 'You are a helpful assistant.',
          },
        },
      };

      const response = await railwayClient.post('', {
        query: mutation,
        variables,
      });

      if (response.data.errors) {
        throw new Error(`Failed to set env vars: ${response.data.errors[0].message}`);
      }

      console.log(`✅ Environment variables set`);
      return response.data.data.variableCollectionUpsert.variableCollection;
    } catch (error) {
      console.error(`❌ Failed to set environment variables: ${error.message}`);
      throw error;
    }
  },

  /**
   * Deploy a Railway service
   */
  deployService: async (railwayServiceId) => {
    try {
      console.log(`📤 Deploying service...`);

      const mutation = `
        mutation Deploy($input: DeployInput!) {
          deploy(input: $input) {
            deployment {
              id
              status
            }
          }
        }
      `;

      const variables = {
        input: {
          serviceId: railwayServiceId,
          environmentId: process.env.RAILWAY_ENVIRONMENT_ID,
        },
      };

      const response = await railwayClient.post('', {
        query: mutation,
        variables,
      });

      if (response.data.errors) {
        throw new Error(`Deploy failed: ${response.data.errors[0].message}`);
      }

      console.log(`✅ Deployment started`);
      return response.data.data.deploy.deployment;
    } catch (error) {
      console.error(`❌ Deployment error: ${error.message}`);
      throw error;
    }
  },

  /**
   * Wait for service to be healthy and get endpoint
   */
  waitForServiceHealth: async (railwayServiceId, maxAttempts = 30) => {
    console.log(`🏥 Waiting for service to be healthy...`);

    for (let i = 0; i < maxAttempts; i++) {
      try {
        const query = `
          query GetService($id: String!) {
            service(id: $id) {
              id
              status
              deployments(first: 1) {
                edges {
                  node {
                    status
                    url
                  }
                }
              }
            }
          }
        `;

        const response = await railwayClient.post('', {
          query,
          variables: { id: railwayServiceId },
        });

        if (response.data.errors) {
          console.log(`  Attempt ${i + 1}/${maxAttempts}: Waiting...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }

        const service = response.data.data.service;
        const deployment = service.deployments?.edges?.[0]?.node;

        if (deployment?.status === 'SUCCESS' && deployment?.url) {
          console.log(`✅ Service healthy at ${deployment.url}`);
          return deployment.url;
        }

        console.log(`  Attempt ${i + 1}/${maxAttempts}: Status ${deployment?.status || 'unknown'}...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.log(`  Attempt ${i + 1}/${maxAttempts}: Waiting...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    throw new Error('Service failed to become healthy in time');
  },

  /**
   * Get service status and endpoint
   */
  getServiceStatus: async (railwayServiceId) => {
    try {
      const query = `
        query GetService($id: String!) {
          service(id: $id) {
            id
            status
            deployments(first: 1) {
              edges {
                node {
                  status
                  url
                }
              }
            }
          }
        }
      `;

      const response = await railwayClient.post('', {
        query,
        variables: { id: railwayServiceId },
      });

      if (response.data.errors) {
        throw new Error(`Failed to get service: ${response.data.errors[0].message}`);
      }

      const service = response.data.data.service;
      const deployment = service.deployments?.edges?.[0]?.node;

      return {
        railwayServiceId: service.id,
        status: deployment?.status || 'unknown',
        endpoint: deployment?.url || null,
      };
    } catch (error) {
      console.error(`❌ Failed to get service status: ${error.message}`);
      throw error;
    }
  },

  /**
   * Stop a Railway service
   */
  stopService: async (railwayServiceId) => {
    try {
      console.log(`⏹  Stopping service...`);

      const mutation = `
        mutation StopService($input: ServiceStopInput!) {
          serviceStop(input: $input) {
            service {
              id
              status
            }
          }
        }
      `;

      const variables = {
        input: {
          serviceId: railwayServiceId,
          environmentId: process.env.RAILWAY_ENVIRONMENT_ID,
        },
      };

      const response = await railwayClient.post('', {
        query: mutation,
        variables,
      });

      if (response.data.errors) {
        throw new Error(`Stop failed: ${response.data.errors[0].message}`);
      }

      console.log(`✅ Service stopped`);
      return response.data.data.serviceStop.service;
    } catch (error) {
      console.error(`❌ Failed to stop service: ${error.message}`);
      throw error;
    }
  },

  /**
   * Delete a Railway service
   */
  deleteService: async (railwayServiceId) => {
    try {
      console.log(`🗑  Deleting service...`);

      const mutation = `
        mutation DeleteService($id: String!) {
          serviceDelete(id: $id)
        }
      `;

      const response = await railwayClient.post('', {
        query: mutation,
        variables: { id: railwayServiceId },
      });

      if (response.data.errors) {
        throw new Error(`Delete failed: ${response.data.errors[0].message}`);
      }

      console.log(`✅ Service deleted`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to delete service: ${error.message}`);
      throw error;
    }
  },

  /**
   * Update service environment variables
   */
  updateServiceConfig: async (railwayServiceId, config) => {
    try {
      console.log(`📝 Updating service configuration...`);

      const updates = {};
      if (config.systemPrompt) updates.SYSTEM_PROMPT = config.systemPrompt;
      if (config.model) updates.BOT_MODEL = config.model;
      if (config.botName) updates.BOT_NAME = config.botName;

      const mutation = `
        mutation UpsertVariables($input: VariableCollectionUpsertInput!) {
          variableCollectionUpsert(input: $input) {
            variableCollection {
              id
            }
          }
        }
      `;

      const variables = {
        input: {
          serviceId: railwayServiceId,
          environmentId: process.env.RAILWAY_ENVIRONMENT_ID,
          variables: updates,
        },
      };

      const response = await railwayClient.post('', {
        query: mutation,
        variables,
      });

      if (response.data.errors) {
        throw new Error(`Update failed: ${response.data.errors[0].message}`);
      }

      console.log(`✅ Configuration updated`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to update config: ${error.message}`);
      throw error;
    }
  },
};
