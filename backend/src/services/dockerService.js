import path from 'path';
import fs from 'fs';

const AGENTS_BASE_PATH = process.env.AGENTS_PATH || '/var/moltrack/agents';

let Docker = null;

// Async Docker initialization
async function initDocker() {
  if (Docker !== null) return Docker;
  try {
    const dockerModule = await import('dockerode');
    Docker = dockerModule.default;
    return Docker;
  } catch (error) {
    console.error('❌ Failed to initialize Docker:', error.message);
    throw error;
  }
}

// Get Docker instance
async function getDocker() {
  if (!Docker) {
    await initDocker();
  }
  return new Docker({
    socketPath: '/var/run/docker.sock',
  });
}

export const dockerService = {
  // Check if Docker is available
  isAvailable: async () => {
    try {
      const docker = await getDocker();
      await docker.ping();
      return true;
    } catch (error) {
      console.error('❌ Docker daemon not accessible:', error.message);
      return false;
    }
  },

  // Launch OpenClaw container for an agent
  launchContainer: async (agentId, runtimeToken, runtimeId) => {
    const docker = await getDocker();
    console.log(`🐳 Launching Docker container for agent ${agentId}...`);

    // Create persistent storage directory
    const agentPath = path.join(AGENTS_BASE_PATH, agentId);
    try {
      if (!fs.existsSync(agentPath)) {
        fs.mkdirSync(agentPath, { recursive: true });
        fs.mkdirSync(path.join(agentPath, '.openclaw', 'agents'), { recursive: true });
        fs.mkdirSync(path.join(agentPath, '.openclaw', 'sessions'), { recursive: true });
        fs.mkdirSync(path.join(agentPath, '.openclaw', 'config'), { recursive: true });
        console.log(`✅ Created storage: ${agentPath}`);
      }
    } catch (error) {
      console.warn(`⚠️  Storage warning: ${error.message}`);
    }

    const port = 18789 + Math.floor(Math.random() * 100);
    const containerName = `openclaw-agent-${agentId}`;
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';

    try {
      // Check if container already exists and remove it
      try {
        const existing = docker.getContainer(containerName);
        const info = await existing.inspect();
        if (info.State.Running) {
          console.log(`⏹  Stopping existing container...`);
          await existing.stop({ t: 10 });
        }
        console.log(`🗑  Removing existing container...`);
        await existing.remove();
      } catch (e) {
        // Doesn't exist, that's fine
      }

      console.log(`📦 Creating container ${containerName} on port ${port}...`);
      const container = await docker.createContainer({
        Image: 'openclaw:latest',
        name: containerName,
        Hostname: `agent-${agentId}`,
        Env: [
          `OPENCLAW_GATEWAY_PORT=18789`,
          `OPENCLAW_API_BASE=${backendUrl}/llm`,
          `OPENCLAW_API_KEY=${runtimeToken}`,
          `AGENT_RUNTIME_ID=${runtimeId}`,
          'TZ=UTC',
        ],
        ExposedPorts: {
          '18789/tcp': {},
        },
        HostConfig: {
          Binds: [`${agentPath}:/root/.openclaw:rw`],
          PortBindings: {
            '18789/tcp': [
              {
                HostIp: '127.0.0.1',
                HostPort: String(port),
              },
            ],
          },
          RestartPolicy: {
            Name: 'on-failure',
            MaximumRetryCount: 3,
          },
        },
      });

      console.log(`🚀 Starting container...`);
      await container.start();
      console.log(`✅ Container running on port ${port}`);

      return {
        containerId: container.id,
        port,
        containerName,
      };
    } catch (error) {
      console.error('❌ Docker error:', error.message);
      throw new Error(`Failed to launch container: ${error.message}`);
    }
  },

  // Stop agent container
  stopContainer: async (agentId) => {
    const docker = await getDocker();
    const containerName = `openclaw-agent-${agentId}`;
    try {
      console.log(`⏹  Stopping ${containerName}...`);
      const container = docker.getContainer(containerName);
      await container.stop({ t: 10 });
      console.log(`✅ Container stopped`);
    } catch (error) {
      console.warn(`⚠️  Stop warning: ${error.message}`);
    }
  },

  // Remove agent container
  removeContainer: async (agentId) => {
    const docker = await getDocker();
    const containerName = `openclaw-agent-${agentId}`;
    try {
      console.log(`🗑  Removing ${containerName}...`);
      const container = docker.getContainer(containerName);
      await container.remove({ force: true });
      console.log(`✅ Container removed`);
    } catch (error) {
      console.warn(`⚠️  Remove warning: ${error.message}`);
    }
  },

  // Get container status
  getContainerStatus: async (agentId) => {
    const docker = await getDocker();
    const containerName = `openclaw-agent-${agentId}`;
    try {
      const container = docker.getContainer(containerName);
      const inspect = await container.inspect();
      return {
        state: inspect.State.Running ? 'running' : 'stopped',
        containerId: inspect.Id,
        ports: inspect.NetworkSettings.Ports,
      };
    } catch (error) {
      return { state: 'not-found', error: error.message };
    }
  },

  // Pull OpenClaw image
  pullImage: async (imageName = 'openclaw:latest') => {
    const docker = await getDocker();
    try {
      console.log(`📥 Checking for image ${imageName}...`);
      const images = await docker.listImages({ 
        filters: { reference: [imageName] } 
      });

      if (images.length === 0) {
        console.log(`📥 Pulling image ${imageName}...`);
        const stream = await docker.pull(imageName);

        return new Promise((resolve, reject) => {
          docker.modem.followProgress(stream, (err, res) => {
            if (err) {
              console.error('❌ Pull error:', err);
              reject(err);
            } else {
              console.log('✅ Image pulled successfully');
              resolve(res);
            }
          });
        });
      }

      console.log(`✅ Image ${imageName} already available`);
      return true;
    } catch (error) {
      console.error('❌ Image pull error:', error);
      throw error;
    }
  },
};
