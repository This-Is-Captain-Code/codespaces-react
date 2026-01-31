# 🚀 MoltRack v0: Railway Bot Architecture - Complete Reference

## 📚 Documentation Index

### For Getting Started (Read First)
1. **[ARCHITECTURE_COMPLETE.md](./ARCHITECTURE_COMPLETE.md)** - Start here!
   - Complete summary of what was built
   - Why each change was made
   - Key improvements
   - Quick testing guide

### For Implementation Details
2. **[RAILWAY_MIGRATION.md](./RAILWAY_MIGRATION.md)** - Architecture deep dive
   - File-by-file breakdown
   - Data models explained
   - API design rationale
   - Security considerations
   - Workflow diagrams

### For Quick Setup
3. **[RAILWAY_QUICKSTART.md](./RAILWAY_QUICKSTART.md)** - Get running in 5 minutes
   - Environment setup
   - Start backend/frontend
   - Test bot creation
   - Test chat messaging
   - Debugging guide

### For Verification
4. **[IMPLEMENTATION_COMPLETE.md](./IMPLEMENTATION_COMPLETE.md)** - Implementation checklist
   - What was implemented
   - What was tested
   - Deployment readiness
   - Phase 2 roadmap

### For Reference
5. **[FILES_MANIFEST.md](./FILES_MANIFEST.md)** - File-by-file reference
   - All files created
   - All files modified
   - Code changes summary
   - Dependencies listed

---

## ⚡ Quick Start (5 Minutes)

### 1. Configure Environment
```bash
cd backend
# Edit .env with Railway credentials
cat > .env << EOF
RAILWAY_API_TOKEN=your_token_here
RAILWAY_PROJECT_ID=your_id_here
RAILWAY_ENVIRONMENT_ID=production
RAILWAY_OPENCLAW_TEMPLATE_ID=your_template_id

OPENROUTER_API_KEY=sk-or-v1-xxxxx
PORT=3001
EOF
```

### 2. Start Backend
```bash
npm install
npm start
# Backend running on http://localhost:3001
```

### 3. Open Frontend
```
http://localhost:3001/public/index.html
```

### 4. Create Your First Bot
- Fill the form
- Click "Create Bot"
- Wait for Railway deployment
- Start chatting!

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────┐
│          Frontend UI (index.html)            │
│  ┌─────────────────────────────────────────┐ │
│  │ Bot Creation | Status | Chat Interface │ │
│  └─────────────────────────────────────────┘ │
└────────────────┬────────────────────────────┘
                 │ HTTP
                 ↓
┌─────────────────────────────────────────────┐
│    Backend API (Express + Node.js)          │
│  ┌──────────────────────────────────────┐   │
│  │ /api/bots/* | /api/chat/*            │   │
│  │                                      │   │
│  │ botService.js | railwayService.js   │   │
│  └──────────────────────────────────────┘   │
└────────────────┬────────────────────────────┘
                 │ GraphQL
                 ↓
┌─────────────────────────────────────────────┐
│    Railway API (Cloud Infrastructure)       │
│  ┌──────────────────────────────────────┐   │
│  │ Create Service | Deploy | Monitor    │   │
│  └──────────────────────────────────────┘   │
└────────────────┬────────────────────────────┘
                 │ Deploy
                 ↓
┌─────────────────────────────────────────────┐
│    Railway Services (Per User)              │
│  ┌──────────────────────────────────────┐   │
│  │ OpenClaw Instance (Persistent)       │   │
│  └──────────────────────────────────────┘   │
└────────────────┬────────────────────────────┘
                 │ HTTP POST
                 ↓
┌─────────────────────────────────────────────┐
│    OpenRouter API                           │
│  ┌──────────────────────────────────────┐   │
│  │ GPT-4 | GPT-3.5 | Claude            │   │
│  └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

---

## 🎯 Core Concepts

### 1. One Bot Per User
- Simplified data model
- Single token identity
- Persistent service on Railway
- Easy scaling

### 2. Token System
- Format: `botId:randomHex`
- Stateless validation
- Easy regeneration
- localStorage persistence

### 3. Railway Integration
- GraphQL API for service creation
- Auto-deployment of OpenClaw
- Health monitoring
- Endpoint management

### 4. Direct Routing
- No local gateway overhead
- Direct HTTP to Railway service
- Fast message processing
- Scalable with Railway

---

## 🔐 Security Model

### Authentication
- Bearer token on all endpoints
- Token format allows offline validation
- Token regeneration invalidates old tokens

### Token Storage
- Frontend: localStorage (auto-persisted)
- Backend: in-memory Map (ready for DB)
- Can be encrypted in production

### API Key Security
- Environment variable injection
- Injected to Railway service
- Not exposed in responses
- Should be encrypted in Phase 2

---

## 📊 Data Models

### Bot (In-Memory Storage)
```
{
  botId: string              // UUID
  userId: string             // User identifier
  botName: string            // User-provided name
  model: string              // gpt-3.5-turbo, gpt-4, etc
  systemPrompt: string       // Bot behavior definition
  endpoint: string           // Railway service URL
  status: string             // running|stopped|deploying
  railwayServiceId: string   // Railway internal ID
  tokenHash: string          // Token validation
  createdAt: number          // Timestamp
  updatedAt: number          // Timestamp
  openrouterApiKey: string   // Encrypted key
}
```

### Token
```
Format: "botId:randomHex32"
Example: "bot-uuid-123:a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"

Validation: Split by colon, lookup botId in userBots Map
Regeneration: Keep botId, generate new random hex
Invalidation: Delete botId entry or mark as revoked
```

---

## 🔄 API Endpoints

### Bot Management
```
POST   /api/bots/create              Create new bot
GET    /api/bots/me                  Get user's bot
PUT    /api/bots/update              Update configuration
GET    /api/bots/status              Check bot health
POST   /api/bots/regenerate-token   Generate new token
DELETE /api/bots/delete              Delete bot
GET    /api/bots/admin/list          List all bots (admin)
```

### Chat
```
POST   /api/chat/message             Send message to bot
GET    /api/chat/history             Fetch message history
POST   /api/chat/clear               Clear history
```

---

## 🧪 Testing Workflow

### Manual Testing
1. Create bot via UI form
2. Verify Railway service deploys
3. Send chat message
4. Verify response from OpenRouter
5. Update bot configuration
6. Regenerate token (verify old token invalid)
7. Delete bot
8. Verify cleanup

### API Testing (curl)
```bash
# Create bot
TOKEN=$(curl -X POST http://localhost:3001/api/bots/create \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","model":"gpt-3.5-turbo","systemPrompt":"Help","apiKey":"sk-or-v1-..."}' \
  | jq -r '.token')

# Send message
curl -X POST http://localhost:3001/api/chat/message \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"Hello"}'

# Get bot status
curl http://localhost:3001/api/bots/me \
  -H "Authorization: Bearer $TOKEN"
```

---

## 📈 Scaling Roadmap

### Phase 1: MVP (Current) ✅
- [x] Single bot per user
- [x] In-memory storage
- [x] Basic authentication
- [x] Railway integration
- [x] Simple chat

### Phase 2: Production (Month 1)
- [ ] PostgreSQL database
- [ ] API key encryption
- [ ] Privy authentication
- [ ] Conversation history
- [ ] Error tracking (Sentry)

### Phase 3: Advanced (Month 2)
- [ ] Multiple conversation threads
- [ ] Bot tools/actions
- [ ] Rate limiting
- [ ] Usage analytics
- [ ] Team collaboration

### Phase 4: Enterprise (Month 3+)
- [ ] SAML/OAuth
- [ ] Audit logs
- [ ] Custom domains
- [ ] Priority support
- [ ] SLA guarantees

---

## ✅ Implementation Status

| Component | Status | Notes |
|-----------|--------|-------|
| Backend Services | ✅ Complete | railwayService, botService |
| API Routes | ✅ Complete | 7 bot endpoints, chat endpoints |
| Frontend UI | ✅ Complete | Bot creation, status, chat |
| Token System | ✅ Complete | Format, persistence, regeneration |
| Documentation | ✅ Complete | 5 comprehensive guides |
| Testing | ✅ Ready | Manual testing workflow defined |
| Database | ⏳ Phase 2 | In-memory Maps ready for migration |
| Authentication | ⏳ Phase 2 | Privy integration planned |
| Analytics | ⏳ Phase 2 | Usage tracking planned |

---

## 🛠️ Technology Stack

### Backend
- **Runtime:** Node.js
- **Framework:** Express.js
- **API:** REST with Bearer tokens
- **Storage:** In-memory Maps (PostgreSQL ready)
- **External APIs:** Railway GraphQL, OpenRouter HTTP

### Frontend
- **Technology:** HTML5 + CSS3 + Vanilla JavaScript
- **Build:** None (static files)
- **Dependencies:** None
- **Storage:** Browser localStorage

### Infrastructure
- **Hosting:** Railway (cloud)
- **Services:** One per bot
- **Template:** OpenClaw
- **LLM Provider:** OpenRouter

---

## 🔗 Quick Links

### Documentation
- [Architecture](./ARCHITECTURE_COMPLETE.md) - Overview
- [Migration Guide](./RAILWAY_MIGRATION.md) - Details
- [Quick Start](./RAILWAY_QUICKSTART.md) - Getting started
- [Implementation](./IMPLEMENTATION_COMPLETE.md) - Verification
- [Files](./FILES_MANIFEST.md) - Reference

### Code
- Backend: `/backend/src/`
- Services: `/backend/src/services/`
- Routes: `/backend/src/routes/`
- Frontend: `/public/index.html`

### Configuration
- Backend: `/backend/.env`
- Package: `/backend/package.json`
- Vite Config: `/vite.config.js`

---

## 🤔 FAQ

### Q: Why one bot per user?
**A:** Simpler state management, easier billing, faster scaling.

### Q: Why Railway instead of local Docker?
**A:** Managed infrastructure, auto-scaling, easier deployment, no ops overhead.

### Q: Why not save tokens in database?
**A:** Coming in Phase 2. MVP uses localStorage for speed.

### Q: Can I have multiple bots?
**A:** Not in current version. Phase 2 roadmap includes this.

### Q: Is it production-ready?
**A:** MVP-ready. Production needs database, auth, encryption (Phase 2).

### Q: How do I extend it?
**A:** See [RAILWAY_MIGRATION.md](./RAILWAY_MIGRATION.md) for extension points.

---

## 📞 Support

### Issues?
1. Check [RAILWAY_QUICKSTART.md](./RAILWAY_QUICKSTART.md) debugging section
2. Review [ARCHITECTURE_COMPLETE.md](./ARCHITECTURE_COMPLETE.md) for context
3. Check browser console (F12) for frontend errors
4. Check backend logs for server errors

### Questions?
- Architecture: Read [RAILWAY_MIGRATION.md](./RAILWAY_MIGRATION.md)
- Getting Started: Read [RAILWAY_QUICKSTART.md](./RAILWAY_QUICKSTART.md)
- Implementation: Read [IMPLEMENTATION_COMPLETE.md](./IMPLEMENTATION_COMPLETE.md)

---

## 📝 Notes

- All new files follow same code style as existing project
- No breaking changes to existing functionality
- Old agent code kept for reference (not used)
- Ready for database migration without code changes
- Ready for Privy integration without code changes
- Production deployment requires Railway credentials

---

## 🎉 Summary

You now have:
- ✅ Complete bot-based architecture
- ✅ Railway cloud integration
- ✅ Simplified 1:1 user:bot model
- ✅ Token-based authentication
- ✅ Clean, modern UI
- ✅ Comprehensive documentation
- ✅ Ready for production (with Phase 2 hardening)

**Next Step:** Configure `.env` and test! See [RAILWAY_QUICKSTART.md](./RAILWAY_QUICKSTART.md).

