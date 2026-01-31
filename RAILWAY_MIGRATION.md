# MoltRack v0 - Docker to Railway Migration

## ✅ Completed: Full Architecture Refactor

### Overview
Successfully migrated MoltRack from **Docker-based local agent management** to **Railway-hosted persistent bot architecture**.

**Old Model:**
```
User → Multiple Agents → Docker Containers (local) → OpenClaw → OpenRouter
```

**New Model:**
```
User → 1 Bot → Railway Service (persistent) → OpenClaw → OpenRouter
```

---

## 🎯 Key Changes

### 1. **Data Model Simplification**
- **Before:** Multiple agents per user, each with its own Docker container
- **After:** Exactly 1 bot per user, hosted as a Railway service
- **Benefit:** Simpler state management, no container lifecycle overhead

### 2. **Token System Redesign**
- **Before:** Complex hashing with runtime token generation
- **After:** Simple 1:1 mapping: `botId:randomHex` format
- **Storage:** In-memory Maps (botTokens, userBots) ready for DB migration
- **Regeneration:** One-click token refresh preserves bot identity

### 3. **Service Architecture**
- **Removed:** 
  - Local Docker orchestration (dockerode)
  - Agent lifecycle management (agentService)
  - Multiple agents per user model
- **Added:**
  - Railway GraphQL API integration (railwayService.js)
  - Bot-per-user service management (botService.js)
  - Railway-hosted OpenClaw instances

---

## 📁 New Backend Files

### `/backend/src/services/railwayService.js`
**Railway API client for service lifecycle management**

- `createBotService(userId, serviceConfig)` - Create Railway service
- `setServiceEnvironmentVariables()` - Inject OpenRouter API key, bot ID, config
- `deployService()` - Deploy service with env vars
- `waitForServiceHealth()` - Poll service status until healthy (30 attempts)
- `getServiceStatus()` - Query current status and endpoint URL
- `stopService()` - Stop without deleting
- `deleteService()` - Full cleanup
- `updateServiceConfig()` - Update system prompt, model, name

**Requirements:**
- `RAILWAY_API_TOKEN` - Bearer token for Railway API
- `RAILWAY_PROJECT_ID` - Railway project identifier
- `RAILWAY_ENVIRONMENT_ID` - Environment (production/staging)
- `RAILWAY_OPENCLAW_TEMPLATE_ID` - OpenClaw service template ID

### `/backend/src/services/botService.js`
**Bot lifecycle management (1 bot per user)**

**Storage:**
- `userBots` Map: `userId → bot object`
- `botTokens` Map: `botId → token`

**Key Methods:**
- `createBot(userId, apiKey, config)` - Single bot per user
- `getBot(userId)` - Retrieve user's bot
- `updateBot(userId, config)` - Update system prompt, model, name
- `deleteBot(userId)` - Stop Railway service, cleanup
- `getBotByToken(token)` - Parse token format for authentication
- `regenerateToken(userId)` - New token for same bot
- `getBotEndpoint(userId)` - Get Railway service URL
- `checkBotStatus(userId)` - Query Railway service health

**Bot Object Structure:**
```javascript
{
  botId: 'uuid',
  userId: 'userId',
  railwayServiceId: 'railway-service-id',
  endpoint: 'https://railway-service-url',
  tokenHash: 'hash-for-validation',
  model: 'gpt-3.5-turbo',
  systemPrompt: 'You are...',
  botName: 'My Bot',
  status: 'running|stopped|deploying',
  createdAt: timestamp,
  updatedAt: timestamp,
  openrouterApiKey: 'encrypted-key'
}
```

### `/backend/src/routes/bots.js`
**API endpoints for bot management**

- `POST /api/bots/create` - Create bot (1 max per user)
- `GET /api/bots/me` - Get user's bot (404 if none)
- `PUT /api/bots/update` - Update config
- `GET /api/bots/status` - Health check Railway service
- `POST /api/bots/regenerate-token` - New token
- `DELETE /api/bots/delete` - Delete bot (requires confirm)
- `GET /api/bots/admin/list` - List all bots (admin only)

**Auth:** Bearer token via `authMiddleware`

---

## 📋 Updated Backend Files

### `/backend/src/routes/chat.js`
**Message routing to Railway bot service**

**Changes:**
- Removed local Docker/OpenClaw gateway routing
- Added direct HTTP POST to Railway service endpoint
- Includes error handling for service unavailability

**Endpoints:**
- `POST /api/chat/message` - Send message to bot
- `GET /api/chat/history?limit=50` - Fetch history from Railway
- `POST /api/chat/clear` - Clear history

**Flow:**
1. Verify bot exists
2. POST message to `bot.endpoint`
3. Return response (or error if service unavailable)

### `/backend/src/index.js`
**Express server configuration**

**Changes:**
```javascript
// OLD:
app.use('/api/agents', agentRoutes);
app.use('/api/billing', billingRoutes);

// NEW:
app.use('/api/bots', botRoutes);
```

### `/backend/.env`
**New Railway configuration variables**

```
RAILWAY_API_TOKEN=your_railway_bearer_token
RAILWAY_PROJECT_ID=project_uuid
RAILWAY_ENVIRONMENT_ID=production_or_staging_id
RAILWAY_OPENCLAW_TEMPLATE_ID=openclaw_template_id
```

---

## 🎨 Frontend Redesign

### `/public/index.html`
**Complete UI refactor from agent-based to bot-based**

**New Structure:**
```
Left Panel (320px):
  - Bot Creation Card (hidden when bot exists)
  - Bot Status Card (shows name, model, status, endpoint, token)
  - Bot Actions Card (update config, regenerate token, delete)

Main Chat Area:
  - Chat Header (bot name, subtitle)
  - Messages Area (user/bot messages)
  - Input Area (message input + send button)

Footer: Attribution
```

**New Features:**
- Bot creation with system prompt editor
- Model selector (GPT-4, GPT-3.5, Claude)
- Token copy-to-clipboard
- Token regeneration with confirmation
- Bot deletion with safety prompt
- Real-time chat with auto-scroll
- Message animations
- Status badges (running/stopped/loading)

**JavaScript Updates:**
- Token management: localStorage for auth persistence
- Bot lifecycle: create → status display → chat → delete
- Error handling for Railway service availability
- Message history in UI (in-memory, no persistence yet)

---

## 🚀 Workflow: User Onboarding

### 1. **First Visit**
User arrives → sees "Create Your Bot" card

### 2. **Bot Creation**
```
User fills form:
  - Bot Name: "My Assistant"
  - Model: "gpt-3.5-turbo"
  - System Prompt: "You are helpful..."
  - API Key: "sk-or-v1-..."

Frontend POST /api/bots/create
  ↓
Backend creates bot in Memory
  ↓
Railroad API creates service
  ↓
Railway deploys OpenClaw with env vars
  ↓
Backend waits for service health
  ↓
Returns bot object + token
  ↓
Frontend stores token in localStorage
  ↓
UI switches to bot status + chat
```

### 3. **Chat**
User types message → POST /api/chat/message → Routes to Railway service → Response returned

### 4. **Token Management**
- Regenerate: New token, same bot identity
- Copy: Token to clipboard for API access
- Delete: Remove bot and Railway service

---

## 💾 Data Storage

**Current:** In-memory Maps (development/testing)
```javascript
{
  userBots: Map { userId → bot }
  botTokens: Map { botId → token }
}
```

**Production Migration:** PostgreSQL
- Replace Maps with database queries
- Encrypt API keys in storage
- Track bot usage/metrics
- Token rotation policies

---

## 🔐 Security Notes

**Token Format:** `botId:randomHex32`
- Easy to validate (parse by colon)
- Stateless verification possible
- No database lookup required

**API Key Handling:**
- Currently stored in plaintext (TODO: encrypt)
- Injected as env var to Railway service
- Never exposed in responses

**Bot Isolation:**
- Each Railway service is independent
- Own environment, own OpenClaw process
- User can only access their bot

---

## ⚙️ Configuration Requirements

Before running, set in `.env`:

```bash
# Railway Configuration
RAILWAY_API_TOKEN=your_bearer_token_from_railway_dashboard
RAILWAY_PROJECT_ID=your_project_id
RAILWAY_ENVIRONMENT_ID=production_or_staging
RAILWAY_OPENCLAW_TEMPLATE_ID=openclaw_service_template_id

# Existing
OPENROUTER_API_KEY=sk-or-v1-...
PORT=3001
```

---

## 📊 Comparison: Docker vs Railway

| Aspect | Docker (Old) | Railway (New) |
|--------|--------------|--------------|
| Bot Count | Multiple per user | 1 per user |
| Hosting | Local containers | Railway cloud |
| State Management | Complex | Simple (1:1 user:bot) |
| Token System | Hashed, complex | Simple format |
| Lifecycle | Manual (start/stop) | Automatic on create |
| Scaling | Docker Swarm needed | Railway handles |
| Database | None needed | Maps (ready for DB) |
| Deployment | Local only | Railway anywhere |

---

## 🔄 Next Steps

### Phase 2: Production Hardening
- [ ] Add PostgreSQL for persistent storage
- [ ] Encrypt API keys in database
- [ ] Add Privy integration for auth
- [ ] Implement bot usage metrics
- [ ] Add rate limiting

### Phase 3: Advanced Features
- [ ] Multiple conversation history per bot
- [ ] Bot settings dashboard
- [ ] Usage analytics
- [ ] Team collaboration
- [ ] Custom models per bot

### Phase 4: Enterprise
- [ ] SAML/OAuth integration
- [ ] Audit logs
- [ ] Custom domain routing
- [ ] Priority support

---

## 📝 Testing Checklist

- [ ] Create bot via UI
- [ ] Bot deploys on Railway
- [ ] Token persists in localStorage
- [ ] Send message to bot
- [ ] Receive response from OpenRouter
- [ ] Update bot config
- [ ] Regenerate token (old token invalid, new works)
- [ ] Delete bot (service stops, token invalid)
- [ ] Create second bot (verify 1 max per user)
- [ ] Refresh page (bot still exists with token)

---

## 📞 Support

**Issues:**
- Railway service not deploying: Check RAILWAY_API_TOKEN
- OpenRouter errors: Verify API key in .env
- Token not persisting: Check browser localStorage

**Architecture Questions:**
See `ARCHITECTURE.md` for detailed design docs.

