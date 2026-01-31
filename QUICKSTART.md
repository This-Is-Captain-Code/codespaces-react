# MoltRack v0 - Quick Start Guide

MoltRack v0 is a managed OpenClaw runtime with agent management, OpenRouter LLM integration, and Docker-based agent isolation.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│         Frontend (React/HTML SPA)                        │
│         Port 3000/5173                                   │
└──────────────────┬──────────────────────────────────────┘
                   │
                   │ HTTP API
                   ▼
┌─────────────────────────────────────────────────────────┐
│         Backend (Express.js)                             │
│         Port 3001                                        │
│  ┌───────────────────────────────────────────────────┐  │
│  │ Agent Service  │ Docker Service  │ OpenClaw API  │  │
│  └───────────────────────────────────────────────────┘  │
└──────────────────┬──────────────────────────────────────┘
                   │
     ┌─────────────┼─────────────┐
     │             │             │
     ▼             ▼             ▼
  Docker     OpenRouter    Persistent
  API        LLM API       Storage
  (/var/     (gpt-3.5,     /var/moltrack/
   run/      Claude, etc)   agents/
   docker.sock)
```

## Prerequisites

- Docker installed and running
- Node.js 16+
- npm or yarn
- OpenRouter API key (get one at openrouter.io)

## Setup Instructions

### 1. Install Dependencies

```bash
# Frontend dependencies
cd /workspaces/codespaces-react
npm install

# Backend dependencies (includes dockerode)
cd backend
npm install
```

### 2. Configure Environment

Edit `/workspaces/codespaces-react/backend/.env`:

```env
# OpenRouter API Configuration
OPENROUTER_API_KEY=your_openrouter_key_here

# Backend Configuration
BACKEND_URL=http://localhost:3001
PORT=3001

# Agent Storage Path
AGENTS_PATH=/var/moltrack/agents

# Auth Token (development)
AUTH_TOKEN=dev-user-123

# LLM Model Selection
LLM_MODEL=gpt-3.5-turbo
```

### 3. Setup Docker Environment

```bash
# Create persistent agent storage directory
sudo mkdir -p /var/moltrack/agents
sudo chmod 777 /var/moltrack/agents

# Pull OpenClaw Docker image (or it will auto-pull on first agent start)
docker pull openclaw:latest
```

### 4. Start the System

**Terminal 1 - Backend:**
```bash
cd /workspaces/codespaces-react/backend
npm run dev
# Should show: "MoltRack Backend running on port 3001"
```

**Terminal 2 - Frontend:**
```bash
cd /workspaces/codespaces-react
npm run dev
# Should show: "Local: http://localhost:5173"
```

### 5. Access the UI

Open http://localhost:5173 (or http://localhost:3000) in your browser.

## Creating and Running Your First Agent

1. **Create Agent**
   - Enter agent name and system prompt
   - Click "Create Agent"
   - Agent appears in the list with "stopped" status

2. **Start Agent**
   - Click "Start" button on the agent
   - System will:
     - Launch Docker container with OpenClaw
     - Create persistent storage volume
     - Health check the gateway
     - Register agent in OpenClaw
   - Status changes to "running"

3. **Chat with Agent**
   - Select the agent from the list
   - Type a message
   - Message routes through:
     - Backend API → OpenClaw Gateway → LLM (OpenRouter)
   - Response returned through same path
   - All messages stored in persistent volume

4. **Stop Agent**
   - Click "Stop" button
   - Docker container stops (volume preserved)
   - Status changes to "stopped"
   - Can be restarted later

5. **Delete Agent**
   - Agent must be stopped first
   - Deletes agent and persistent storage
   - Cannot be undone

## System Components

### Frontend (`/src` and `/public`)
- React/HTML UI for agent management and chat
- Agent creation form
- Agent list with start/stop/delete controls
- Chat interface with message history
- Real-time status updates

### Backend (`/backend/src`)

**Core Services:**
- `agentService.js` - Agent lifecycle management (CRUD, start, stop)
- `dockerService.js` - Docker container orchestration
- `openclawService.js` - OpenClaw gateway API client
- `openrouterService.js` - LLM proxy (OpenRouter)
- `billingService.js` - Credit/billing system (currently disabled)

**Routes:**
- `/api/agents` - Agent CRUD endpoints
- `/api/chat/:agentId/message` - Message routing through OpenClaw
- `/api/billing` - Billing endpoints

**Middleware:**
- CORS enabled for local development
- Bearer token auth (development token: `dev-user-123`)
- Error handling

### Docker Integration
- **Image:** openclaw:latest (pulled from Docker Hub)
- **Runtime:** Containerized OpenClaw gateway per agent
- **Port:** Random ephemeral port (18789-18889)
- **Storage:** Persistent volumes at `/var/moltrack/agents/{agentId}/.openclaw/`
- **Network:** Host networking for local connectivity

### Storage Structure

```
/var/moltrack/agents/
├── {agent-id}/
│   └── .openclaw/
│       ├── agents/       # Agent definitions
│       ├── sessions/     # Chat session history
│       └── config/       # Agent configuration
```

## API Reference

### Create Agent
```
POST /api/agents
Content-Type: application/json
Authorization: Bearer dev-user-123

{
  "name": "My AI Assistant",
  "systemPrompt": "You are a helpful assistant..."
}
```

### List Agents
```
GET /api/agents
Authorization: Bearer dev-user-123
```

### Start Agent
```
POST /api/agents/:agentId/start
Authorization: Bearer dev-user-123
```

### Send Message
```
POST /api/chat/:agentId/message
Content-Type: application/json
Authorization: Bearer dev-user-123

{
  "message": "Hello, how are you?",
  "model": "gpt-3.5-turbo"
}
```

## Troubleshooting

### Backend won't start
- Check if port 3001 is in use: `lsof -i :3001`
- Verify Docker socket exists: `ls -la /var/run/docker.sock`
- Check `.env` file configuration

### Agent won't start
- Verify Docker is running: `docker ps`
- Check OpenClaw image: `docker images | grep openclaw`
- Verify storage directory permissions: `ls -la /var/moltrack/agents`
- Check backend logs for error messages

### Chat messages not routing
- Verify agent is in "running" state
- Check backend logs for OpenClaw gateway errors
- Verify OpenRouter API key is set and valid
- Check network connectivity: `curl http://127.0.0.1:18789/health`

### Docker permissions denied
```bash
# Add user to docker group
sudo usermod -aG docker $USER
# Log out and back in
```

## Advanced Configuration

### Custom LLM Models
Edit backend `.env` to change `LLM_MODEL`:
- `gpt-4` - Most capable but slower
- `gpt-3.5-turbo` - Default, good balance
- `claude-3-opus` - Alternative LLM
- `meta-llama/llama-2-70b` - Open source

### Enable Billing System
In `backend/src/routes/chat.js`, uncomment billing checks:
```javascript
// const billingCheck = await billingService.checkCredits(userId);
// if (!billingCheck.hasCredits) {
//   return res.status(402).json({ error: 'Insufficient credits' });
// }
```

### Production Deployment
1. Use proper database instead of in-memory storage
2. Implement real authentication (Privy integration ready)
3. Set up HTTPS with valid certificates
4. Use process manager (PM2) for backend
5. Deploy frontend to CDN
6. Configure proper Docker registry
7. Implement monitoring and logging
8. Set resource limits on containers

## Development Notes

- Hot reload enabled for backend with `npm run dev`
- Frontend uses Vite for fast development
- All API requests use relative paths for CORS compatibility
- Docker socket accessed at `/var/run/docker.sock`
- Persistent storage survives container restart
- Tokens are hashed for security (except in dev auth)

## Support & Documentation

- Technical spec: `MoltRack v0 — Technical Implementation.txt`
- OpenClaw docs: https://openclaw.dev
- OpenRouter docs: https://openrouter.io/docs
- Docker docs: https://docs.docker.com
