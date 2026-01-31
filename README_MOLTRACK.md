# MoltRack v0 - OpenClaw Agent Runtime

A full-stack application for managing persistent OpenClaw agents with OpenRouter integration, billing, and chat interface.

## Architecture

```
Browser (React Chat UI)
    ↓
MoltRack Backend API (Express.js)
    ↓
OpenRouter API
    ↓
LLM (Claude, GPT, etc.)
```

## Features

- **Agent Management**: Create, start, stop, and delete agents
- **Chat Interface**: Real-time conversation with running agents
- **Model Selection**: Choose from multiple LLMs via OpenRouter
- **Credit System**: PAYG billing with token-based pricing
- **Agent State**: Track running, stopped, and errored states
- **System Prompts**: Customize agent behavior with instructions

## Project Structure

```
/workspaces/codespaces-react/
├── backend/                    # Express.js server
│   ├── src/
│   │   ├── index.js           # Main server entry
│   │   ├── services/
│   │   │   ├── agentService.js
│   │   │   ├── openrouterService.js
│   │   │   └── billingService.js
│   │   ├── routes/
│   │   │   ├── agents.js
│   │   │   ├── chat.js
│   │   │   └── billing.js
│   │   └── middleware/
│   │       └── auth.js
│   └── package.json
├── src/                        # React frontend
│   ├── components/
│   │   ├── AgentForm.jsx
│   │   ├── AgentList.jsx
│   │   ├── ChatInterface.jsx
│   │   └── BillingCard.jsx
│   ├── api/
│   │   └── client.js          # API client
│   ├── App.jsx
│   └── App.css
└── package.json
```

## Setup

### Prerequisites

- Node.js 18+
- OpenRouter API key (get one at https://openrouter.ai)

### Backend Setup

```bash
cd backend
npm install
cp .env.example .env
# Edit .env and add your OPENROUTER_API_KEY
npm run dev
```

The backend will start on `http://localhost:3001`

### Frontend Setup

```bash
npm install
npm start
```

The frontend will start on `http://localhost:5173` (or port 3000 if configured)

## Configuration

### Backend `.env` file

```env
PORT=3001
OPENROUTER_API_KEY=sk_live_...your_key_here...
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
FRONTEND_URL=http://localhost:5173
DATABASE_URL=postgresql://user:password@localhost:5432/moltrack
```

### Environment Variables

- `OPENROUTER_API_KEY`: Required for API calls to OpenRouter
- `FRONTEND_URL`: CORS origin for the backend
- `PORT`: Backend server port (default: 3001)

## Usage

### Creating an Agent

1. Enter agent name and system prompt
2. Click "Create Agent"
3. Agent appears in the list

### Starting an Agent

1. Click "Start" on an agent card
2. Wait for state to change to "running"
3. Select the agent to open chat

### Chatting

1. Select a running agent
2. Choose a model from the dropdown
3. Type your message and click "Send"
4. Credits are deducted based on token usage

### Adding Credits

Click the credit package buttons in the billing card to simulate adding credits (in production, this would use Stripe).

## API Endpoints

### Agents

- `POST /api/agents` - Create agent
- `GET /api/agents` - List user's agents
- `GET /api/agents/:agentId` - Get agent details
- `PATCH /api/agents/:agentId` - Update agent
- `POST /api/agents/:agentId/start` - Start agent
- `POST /api/agents/:agentId/stop` - Stop agent
- `DELETE /api/agents/:agentId` - Delete agent

### Chat

- `POST /api/chat/:agentId/message` - Send message to agent

### Billing

- `GET /api/billing/balance` - Get user's credit balance
- `POST /api/billing/add-credits` - Add credits (simulated)

## Authentication

Currently uses a simple bearer token. Replace with Privy integration:

```javascript
// In backend/src/middleware/auth.js
// Add Privy verification here
```

## Models Available (via OpenRouter)

- GPT-4 Turbo
- GPT-3.5 Turbo
- Claude 3 Opus
- Claude 3 Sonnet
- Llama 2 70B

## Pricing

Approximate pricing (from OpenRouter):

- GPT-4 Turbo: $0.015 input / $0.045 output per 1M tokens
- GPT-3.5 Turbo: $0.0005 input / $0.0015 output per 1M tokens
- Claude 3 Opus: $0.015 input / $0.075 output per 1M tokens

## Next Steps

1. **Privy Integration**: Replace mock auth with Privy X login
2. **Database**: Replace in-memory storage with PostgreSQL
3. **Docker**: Add Docker container orchestration for agents
4. **Stripe**: Integrate Stripe for credit purchases
5. **Persistence**: Implement OpenClaw volume mounting
6. **Streaming**: Add streaming responses for real-time output

## Development

### Hot Reload

Frontend hot reloads automatically with Vite.

Backend can be restarted with:
```bash
npm run dev  # In backend directory
```

### Testing

Create a test agent:

```bash
curl -X POST http://localhost:3001/api/agents \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev-user-123" \
  -d '{"name":"Test Agent","systemPrompt":"You are helpful."}'
```

## Troubleshooting

### "OPENROUTER_API_KEY not configured"

Ensure your `.env` file in `/backend` has the correct API key.

### CORS errors

Check that `FRONTEND_URL` in backend `.env` matches your frontend URL.

### Agent won't start

Check backend logs for Docker/storage provisioning errors.

## License

MIT
